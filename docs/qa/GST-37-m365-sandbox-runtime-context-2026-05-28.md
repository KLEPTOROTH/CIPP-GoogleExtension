# GST-37 Release Handoff: M365 Sandbox Runtime Context for GST-34

Date (UTC): 2026-05-28  
Issue: GST-37  
Consumer: GST-34 live QA validation

## Purpose

Provide the exact runtime context contract QA needs to execute the live `GST-9` runbook steps for `adapter-m365` without exposing secret values in-repo.

## Required Runtime Inputs

`adapter-m365` resolves tenant/auth context in this order:

1. `tenantIdProvider` / `tokenProvider` overrides (if test harness injects them)
2. Key Vault secret lookup via managed identity (default runtime path)

For live QA validation, ensure these inputs exist in the target environment.

## Required Environment Variables

- `KEY_VAULT_URI`
  - Base URI for Azure Key Vault used by `adapter-m365`.
  - Example format: `https://<vault-name>.vault.azure.net`
- `AZURE_CLIENT_ID` (if using user-assigned managed identity)
  - Client ID for managed identity token acquisition against IMDS.

## Required Key Vault Secrets

Default secret names expected by `packages/adapter-m365/src/index.ts`:

- `gdap/graph/client-id`
  - Azure AD app client ID used for Graph OAuth client-credentials flow.
- `gdap/graph/client-secret`
  - Azure AD app client secret.
- `gdap/graph/tenant-id`
  - Home tenant used for token issuance metadata.
- `gdap/{customerId}/tenant-id`
  - Customer-specific tenant binding consumed by `getCustomerTenantId`.
  - `{customerId}` must match the customer used in the smoke run.

## QA Execution Context Required for GST-34

Before running `docs/gst-9-m365-smoke-runbook.md`, QA must have:

- `customerId` for the sandbox customer under test
- `userKey` for a non-production user in that customer tenant
- Confirmation that `gdap/{customerId}/tenant-id` exists and maps to the intended M365 sandbox tenant
- Confirmation that Graph app secrets (`gdap/graph/*`) are present and unexpired

## Preflight Verification Commands (No Secret Output)

These checks validate presence only.

```bash
# 1) Verify environment variables are set (do not print values)
[ -n "$KEY_VAULT_URI" ] && echo "KEY_VAULT_URI=present" || echo "KEY_VAULT_URI=missing"
[ -n "$AZURE_CLIENT_ID" ] && echo "AZURE_CLIENT_ID=present" || echo "AZURE_CLIENT_ID=missing"

# 2) Verify required secret names resolve in Key Vault
az keyvault secret show --vault-name <vault-name> --name "gdap/graph/client-id" --query "id" -o tsv
az keyvault secret show --vault-name <vault-name> --name "gdap/graph/client-secret" --query "id" -o tsv
az keyvault secret show --vault-name <vault-name> --name "gdap/graph/tenant-id" --query "id" -o tsv
az keyvault secret show --vault-name <vault-name> --name "gdap/<customerId>/tenant-id" --query "id" -o tsv
```

If any secret lookup fails, GST-34 remains blocked until Release Engineer refreshes credentials/bindings.

## Disposition

GST-37 deliverable is complete once this context is loaded into the QA runtime and QA reruns GST-34 live smoke with evidence.
