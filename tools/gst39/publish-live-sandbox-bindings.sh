#!/usr/bin/env bash
set -euo pipefail

# Produces a sanitized GST-39 publication payload from live runtime bindings.
# Never prints Graph client secret values.

required_bin() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "missing dependency: $1" >&2
    exit 2
  fi
}

required_env() {
  local name="$1"
  if [ -z "${!name:-}" ]; then
    echo "missing required env: $name" >&2
    exit 3
  fi
}

required_bin az
required_bin jq

required_env KEY_VAULT_URI
required_env GST39_CUSTOMER_ID
required_env GST39_USER_KEY

vault_name="${GST39_VAULT_NAME:-}"
if [ -z "$vault_name" ]; then
  vault_name="$(printf '%s' "$KEY_VAULT_URI" | sed -E 's#^https://([^./]+)\..*$#\1#')"
fi

if [ -z "$vault_name" ] || [ "$vault_name" = "$KEY_VAULT_URI" ]; then
  echo "could not derive vault name from KEY_VAULT_URI; set GST39_VAULT_NAME" >&2
  exit 4
fi

customer_id="$GST39_CUSTOMER_ID"
user_key="$GST39_USER_KEY"
secret_name="gdap/${customer_id}/tenant-id"

# Presence checks for required Graph secret names (no secret values emitted).
graph_client_id_secret_id="$(az keyvault secret show --vault-name "$vault_name" --name "gdap/graph/client-id" --query id -o tsv)"
graph_client_secret_secret_id="$(az keyvault secret show --vault-name "$vault_name" --name "gdap/graph/client-secret" --query id -o tsv)"
graph_tenant_secret_id="$(az keyvault secret show --vault-name "$vault_name" --name "gdap/graph/tenant-id" --query id -o tsv)"

# Tenant mapping value is required for GST-39 confirmation payload.
tenant_id="$(az keyvault secret show --vault-name "$vault_name" --name "$secret_name" --query value -o tsv)"

verified_at="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
verified_by="${GST39_VERIFIED_BY:-release-engineer}"

jq -n \
  --arg customerId "$customer_id" \
  --arg userKey "$user_key" \
  --arg secretName "$secret_name" \
  --arg tenantId "$tenant_id" \
  --arg verifiedAtUtc "$verified_at" \
  --arg verifiedBy "$verified_by" \
  --arg graphClientIdSecretId "$graph_client_id_secret_id" \
  --arg graphClientSecretSecretId "$graph_client_secret_secret_id" \
  --arg graphTenantSecretId "$graph_tenant_secret_id" \
  '{
    customerId: $customerId,
    userKey: $userKey,
    tenantMapping: {
      secretName: $secretName,
      tenantId: $tenantId,
      verifiedAtUtc: $verifiedAtUtc,
      verifiedBy: $verifiedBy
    },
    evidence: {
      keyVaultSecretPresent: true,
      graphSecretsPresent: true,
      source: "release-runtime",
      graphSecretIds: {
        clientId: $graphClientIdSecretId,
        clientSecret: $graphClientSecretSecretId,
        tenantId: $graphTenantSecretId
      }
    }
  }'
