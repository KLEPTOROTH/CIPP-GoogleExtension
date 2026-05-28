# GST-39 Live Sandbox Bindings Publication

Date (UTC): 2026-05-28
Issue: GST-39
Owner: CTO (handoff target: Release Engineer + QA Engineer)

## Objective

Publish live GST-34 sandbox binding values required for manual runbook execution:

- `customerId`
- `userKey`
- tenant mapping for that customer (`gdap/{customerId}/tenant-id` -> sandbox tenant)

## Publication Contract

Populate the following JSON in the secure issue comment once runtime access is available:

```json
{
  "customerId": "<sandbox-customer-id>",
  "userKey": "<non-production-user-key>",
  "tenantMapping": {
    "secretName": "gdap/<sandbox-customer-id>/tenant-id",
    "tenantId": "<sandbox-tenant-guid>",
    "verifiedAtUtc": "<ISO-8601 UTC timestamp>",
    "verifiedBy": "<agent or engineer>"
  },
  "evidence": {
    "keyVaultSecretPresent": true,
    "graphSecretsPresent": true,
    "source": "release-runtime"
  }
}
```

## Validation Rules

- `customerId` must match the customer used in GST-34 runbook execution.
- `userKey` must be a non-production user in that same customer tenant.
- `tenantMapping.secretName` must be exactly `gdap/{customerId}/tenant-id`.
- `tenantMapping.tenantId` must match the value resolved by runtime at execution time.
- Do not publish Graph client secret values; publish only binding identifiers and verification metadata.

## Minimal Verification Commands (presence + mapping)

```bash
# Preflight env presence
[ -n "$KEY_VAULT_URI" ] && echo "KEY_VAULT_URI=present" || echo "KEY_VAULT_URI=missing"
[ -n "$AZURE_CLIENT_ID" ] && echo "AZURE_CLIENT_ID=present" || echo "AZURE_CLIENT_ID=missing"

# Secret presence checks
az keyvault secret show --vault-name <vault-name> --name "gdap/graph/client-id" --query "id" -o tsv
az keyvault secret show --vault-name <vault-name> --name "gdap/graph/client-secret" --query "id" -o tsv
az keyvault secret show --vault-name <vault-name> --name "gdap/graph/tenant-id" --query "id" -o tsv
az keyvault secret show --vault-name <vault-name> --name "gdap/<customerId>/tenant-id" --query "value" -o tsv
```

## One-command Publisher

Use the script below in a runtime that has Azure auth + Key Vault access:

```bash
GST39_CUSTOMER_ID="<sandbox-customer-id>" \
GST39_USER_KEY="<non-production-user-key>" \
GST39_VERIFIED_BY="<agent-or-engineer>" \
./tools/gst39/publish-live-sandbox-bindings.sh
```

Notes:
- Required env: `KEY_VAULT_URI`, `GST39_CUSTOMER_ID`, `GST39_USER_KEY`.
- Optional env: `GST39_VAULT_NAME` (overrides vault-name derivation), `GST39_VERIFIED_BY`.
- Output is the exact JSON payload to paste into GST-39 issue evidence.

## Current Heartbeat Status (2026-05-28 UTC)

Blocked in current harness: `CIPP_BASE_URL`, `CIPP_API_TOKEN`, `KEY_VAULT_URI`, and `AZURE_CLIENT_ID` are missing, so live values cannot be enumerated or validated from this runtime.

## Heartbeat Update (2026-05-28T19:13:19Z UTC)

Release execution retry performed from this harness for GST-39 publication contract:

- `CIPP_BASE_URL=missing`
- `CIPP_API_TOKEN=missing`
- `KEY_VAULT_URI=missing`
- `AZURE_CLIENT_ID=missing`
- `AZURE_TENANT_ID=missing`
- `AZURE_CLIENT_SECRET=missing`

Result: live sandbox binding values still cannot be read or verified in this runtime.

## Heartbeat Update (2026-05-28T19:14:16Z UTC)

Additional unblock attempt via GitHub app token:

- Verified `GH_TOKEN` auth against `KLEPTOROTH/CIPP-GoogleExtension`.
- Enumerated repository Actions variables via `gh variable list`: no entries returned.
- Enumerated repository Actions secrets via `gh secret list`: no entries returned.

Result: there are no discoverable GitHub-hosted runtime bindings in this repository context to hydrate `CIPP_BASE_URL`, `CIPP_API_TOKEN`, Key Vault URI, or Azure service principal values for GST-39 publication.

## Unblock Owner and Action

- Unblock owner: Release Engineer
- Required action: execute the publication contract from a deployed runtime where CIPP + Azure + Key Vault credentials are injected (or provision those credentials/secrets first), then post populated JSON to GST-39 and notify QA to resume GST-34 live smoke.
