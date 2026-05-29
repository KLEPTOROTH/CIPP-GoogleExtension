# Infra (Bicep)

Phase 0 Azure baseline for the CIPP Google Extension backend.

## Files

| File | Purpose |
|---|---|
| `main.bicep` | Resource declarations: Function App, Storage, Key Vault, App Insights, Static Web App, RBAC. |
| `dev.bicepparam` | Per-environment values for `dev`. Free/cheap SKUs, deploys on PR. |
| `prod.bicepparam` | Per-environment values for `prod`. Premium SKUs, manual approve. |

## Pre-deploy human action (one-time per subscription)

The Bicep templates expect a **user-assigned managed identity bound by federated credential** to the GitHub Actions workflow. Until the human subscription owner provisions it and pastes the principal ID into the `.bicepparam` files, the deploy workflow refuses to run.

Setup checklist:

1. Create the user-assigned identity in the subscription:
   ```
   az identity create -n cge-dev-deploy -g <rg-name>
   ```
2. Add a federated credential bound to the repo's `dev` environment:
   ```
   az identity federated-credential create \
     --name github-cge-dev \
     --identity-name cge-dev-deploy \
     --resource-group <rg-name> \
     --issuer https://token.actions.githubusercontent.com \
     --subject 'repo:KLEPTOROTH/CIPP-GoogleExtension:environment:dev' \
     --audience api://AzureADTokenExchange
   ```
3. Grant the identity `Contributor` on the resource group so the `az deployment group create` call below can succeed.
4. Copy its `principalId` into `dev.bicepparam` → `deployIdentityPrincipalId`.
5. Repeat for `prod` (subject `repo:KLEPTOROTH/CIPP-GoogleExtension:environment:prod`).

This setup lives outside the Bicep file because:

- It bootstraps the deploy identity itself — chicken/egg.
- It requires the human to log in once with subscription-owner credentials, which CI cannot.

## Lint locally

```
az bicep build -f infra/bicep/main.bicep --stdout > /dev/null
```

CI runs the same check on every PR.

## Deploy locally (smoke test)

```
az deployment group create \
  -g rg-cge-dev \
  -f infra/bicep/main.bicep \
  -p infra/bicep/dev.bicepparam
```

In normal operation this runs from the GitHub Actions workflow (`.github/workflows/deploy-azure.yml`); no local credentials needed.
