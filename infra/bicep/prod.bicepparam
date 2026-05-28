using './main.bicep'

// Prod environment — manual-approve via GitHub Environments. EP1
// (Elastic Premium) Functions plan for warm-start + VNet integration
// later; SWA Standard for SLA + custom domains.

param envSlug = 'prod'
param functionPlanSku = 'EP1'
param deployStaticWebApp = true

// Same trip-wire as dev: populated by the subscription owner before
// the first prod deploy.
param deployIdentityPrincipalId = ''

param keyVaultAdminPrincipalIds = []
