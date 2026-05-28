using './main.bicep'

// Dev environment — deploys on PR via OIDC. Y1 (Consumption) plan, SWA
// free tier. Region pinned to East US 2 because Azure Functions Node 20
// on Linux + Static Web Apps both have GA support there.

param envSlug = 'dev'
param functionPlanSku = 'Y1'
param deployStaticWebApp = true

// Principal ID of the user-assigned managed identity bound by federated
// credential to the GitHub Actions workflow for the `dev` environment.
// Provisioned out-of-band by the human Azure subscription owner;
// recorded here so the Bicep deployment can grant it RBAC.
//
// Empty string is a deliberate trip-wire — the deploy workflow refuses
// to run until this is populated by the subscription owner.
param deployIdentityPrincipalId = ''

// Optional: Azure AD object IDs of humans who get Key Vault Secrets
// Officer in dev (rotate secrets without portal access policies).
// Populated by the subscription owner.
param keyVaultAdminPrincipalIds = []
