// CIPP Google Extension — Phase 0 Azure baseline.
//
// Declares the resources every variant of the architecture (Option B
// companion, browser-extension, or standalone) needs:
//
//   - Function App (Node 20, Linux) — our backend API surface.
//   - Storage Account (Tables + Blob) — tenant directory, audit index/payloads.
//   - Key Vault — refresh tokens, app secrets, GDAP credential material.
//   - Application Insights + Log Analytics — observability.
//   - Static Web App — front-end host (apps/web/, when scaffolding lands).
//
// Identity model: the Function App uses a system-assigned managed
// identity, granted least-privilege RBAC against Storage and Key Vault.
// CI deploys via a separate user-assigned identity bound by federated
// credential to GitHub OIDC (wired in .github/workflows/deploy-azure.yml).

targetScope = 'resourceGroup'

@description('Short environment slug — used as a name suffix. Example: dev, prod.')
@allowed([ 'dev', 'prod' ])
param envSlug string

@description('Deployment region. Defaults to the resource group\'s location.')
param location string = resourceGroup().location

@description('Azure AD object ID of the user-assigned identity used by the GitHub Actions deploy workflow. RBAC grants are scoped to it.')
param deployIdentityPrincipalId string

@description('Azure AD object IDs that receive Key Vault Secrets Officer on this environment (release engineers, on-call). Empty by default; populated per-env in the .bicepparam files.')
param keyVaultAdminPrincipalIds array = []

@description('Tags applied to every resource. Source of truth for cost attribution and AGPL compliance.')
param resourceTags object = {
  project: 'cipp-google-extension'
  managedBy: 'bicep'
  license: 'AGPL-3.0-only'
}

@description('SKU for the Function App plan. Y1 (Consumption) for dev; EP1 (Premium) for prod.')
@allowed([ 'Y1', 'EP1' ])
param functionPlanSku string

@description('Skip the Static Web App in environments where the front-end is hosted elsewhere. Defaults to true; both dev and prod ship it.')
param deployStaticWebApp bool = true

// --------------------------------------------------------------------
// Naming — kept short and deterministic so the same param file works
// in any subscription. Storage account names have to be globally
// unique and ≤24 chars; derive from rg name hash.
// --------------------------------------------------------------------
var namePrefix = 'cge-${envSlug}'
var storageAccountName = take(toLower(replace('cge${envSlug}${uniqueString(resourceGroup().id)}', '-', '')), 24)
var keyVaultName = take('${namePrefix}-kv-${uniqueString(resourceGroup().id)}', 24)
var functionAppName = '${namePrefix}-api'
var functionPlanName = '${namePrefix}-plan'
var appInsightsName = '${namePrefix}-ai'
var logAnalyticsName = '${namePrefix}-law'
var staticSiteName = '${namePrefix}-web'

// --------------------------------------------------------------------
// Observability
// --------------------------------------------------------------------
resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: logAnalyticsName
  location: location
  tags: resourceTags
  properties: {
    sku: { name: 'PerGB2018' }
    retentionInDays: 30
  }
}

resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: appInsightsName
  location: location
  tags: resourceTags
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: logAnalytics.id
    publicNetworkAccessForIngestion: 'Enabled'
    publicNetworkAccessForQuery: 'Enabled'
  }
}

// --------------------------------------------------------------------
// Storage — Tables (tenant directory, audit index) + Blob (audit payloads)
// --------------------------------------------------------------------
resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: storageAccountName
  location: location
  tags: resourceTags
  sku: { name: 'Standard_LRS' }
  kind: 'StorageV2'
  properties: {
    accessTier: 'Hot'
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
    allowBlobPublicAccess: false
    allowSharedKeyAccess: true // Functions runtime + Azure CLI deploy still need it; tighten in a later phase.
    defaultToOAuthAuthentication: true
    networkAcls: {
      defaultAction: 'Allow'
      bypass: 'AzureServices'
    }
  }
}

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: storage
  name: 'default'
  properties: {
    deleteRetentionPolicy: { enabled: true, days: 7 }
  }
}

resource auditBlobContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobService
  name: 'audit'
  properties: {
    publicAccess: 'None'
  }
}

resource tableService 'Microsoft.Storage/storageAccounts/tableServices@2023-05-01' = {
  parent: storage
  name: 'default'
}

resource customersTable 'Microsoft.Storage/storageAccounts/tableServices/tables@2023-05-01' = {
  parent: tableService
  name: 'customers'
}

resource auditIndexTable 'Microsoft.Storage/storageAccounts/tableServices/tables@2023-05-01' = {
  parent: tableService
  name: 'auditIndex'
}

// --------------------------------------------------------------------
// Key Vault — refresh tokens, app secrets, GDAP credential material.
// RBAC mode (no access policies).
// --------------------------------------------------------------------
resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: keyVaultName
  location: location
  tags: resourceTags
  properties: {
    tenantId: subscription().tenantId
    sku: { family: 'A', name: 'standard' }
    enableRbacAuthorization: true
    enablePurgeProtection: true
    enableSoftDelete: true
    softDeleteRetentionInDays: 90
    publicNetworkAccess: 'Enabled'
    networkAcls: {
      defaultAction: 'Allow'
      bypass: 'AzureServices'
    }
  }
}

// --------------------------------------------------------------------
// Function App (Node 20, Linux)
// --------------------------------------------------------------------
resource functionPlan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: functionPlanName
  location: location
  tags: resourceTags
  sku: {
    name: functionPlanSku
    tier: functionPlanSku == 'Y1' ? 'Dynamic' : 'ElasticPremium'
  }
  kind: 'linux'
  properties: {
    reserved: true
  }
}

resource functionApp 'Microsoft.Web/sites@2023-12-01' = {
  name: functionAppName
  location: location
  tags: resourceTags
  kind: 'functionapp,linux'
  identity: { type: 'SystemAssigned' }
  properties: {
    serverFarmId: functionPlan.id
    httpsOnly: true
    siteConfig: {
      linuxFxVersion: 'NODE|20'
      ftpsState: 'Disabled'
      minTlsVersion: '1.2'
      use32BitWorkerProcess: false
      appSettings: [
        // Functions runtime
        { name: 'FUNCTIONS_EXTENSION_VERSION', value: '~4' }
        { name: 'FUNCTIONS_WORKER_RUNTIME', value: 'node' }
        { name: 'WEBSITE_NODE_DEFAULT_VERSION', value: '~20' }
        // Storage (runtime + content share)
        { name: 'AzureWebJobsStorage', value: 'DefaultEndpointsProtocol=https;AccountName=${storage.name};EndpointSuffix=${environment().suffixes.storage};AccountKey=${storage.listKeys().keys[0].value}' }
        { name: 'WEBSITE_CONTENTAZUREFILECONNECTIONSTRING', value: 'DefaultEndpointsProtocol=https;AccountName=${storage.name};EndpointSuffix=${environment().suffixes.storage};AccountKey=${storage.listKeys().keys[0].value}' }
        { name: 'WEBSITE_CONTENTSHARE', value: toLower(functionAppName) }
        // App Insights
        { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', value: appInsights.properties.ConnectionString }
        // AGPL §13 — wired by the deploy workflow per release. Defaults are
        // safe fallbacks so the endpoint still responds before first deploy
        // injection.
        { name: 'SOURCE_REPO_URL', value: 'https://github.com/KLEPTOROTH/CIPP-GoogleExtension' }
        { name: 'SOURCE_LICENSE', value: 'AGPL-3.0' }
        { name: 'SOURCE_COMMIT_SHA', value: 'unknown' }
        { name: 'SOURCE_TAG', value: 'unknown' }
        // Key Vault reference base — secrets are read by URI from app code.
        { name: 'KEY_VAULT_URI', value: keyVault.properties.vaultUri }
      ]
    }
  }
}

// --------------------------------------------------------------------
// Static Web App — apps/web/ (when scaffolding lands).
// Free tier is sufficient for dev; prod uses Standard for SLA + custom domain.
// --------------------------------------------------------------------
resource staticSite 'Microsoft.Web/staticSites@2023-12-01' = if (deployStaticWebApp) {
  name: staticSiteName
  location: location
  tags: resourceTags
  sku: {
    name: envSlug == 'prod' ? 'Standard' : 'Free'
    tier: envSlug == 'prod' ? 'Standard' : 'Free'
  }
  properties: {
    // Repository binding is set out-of-band by the deploy workflow rather
    // than here, so the Bicep template stays cleanly idempotent.
    provider: 'GitHub'
    buildProperties: {
      appLocation: 'apps/web'
      apiLocation: ''
      outputLocation: 'apps/web/out'
    }
  }
}

// --------------------------------------------------------------------
// RBAC — least privilege for the Function App's managed identity and
// the GitHub OIDC deploy identity.
// --------------------------------------------------------------------

// Roles we reference (built-in role definition GUIDs).
var roleStorageBlobDataContributor = 'ba92f5b4-2d11-453d-a403-e96b0029c9fe'
var roleStorageTableDataContributor = '0a9a7e1f-b9d0-4cc4-a60d-0319b160aaa3'
var roleKeyVaultSecretsUser = '4633458b-17de-408a-b874-0445c86b69e6'
var roleKeyVaultSecretsOfficer = 'b86a8fe4-44ce-4948-aee5-eccb2c155cd7'
var roleMonitoringMetricsPublisher = '3913510d-42f4-4e42-8a64-420c390055eb'
var roleWebsiteContributor = 'de139f84-1756-47ae-9be6-808fbbe84772'

// Function App identity → Storage Blob (audit payloads).
resource fnStorageBlob 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(storage.id, functionApp.id, roleStorageBlobDataContributor)
  scope: storage
  properties: {
    principalId: functionApp.identity.principalId
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roleStorageBlobDataContributor)
    principalType: 'ServicePrincipal'
  }
}

// Function App identity → Storage Tables (tenant directory, audit index).
resource fnStorageTable 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(storage.id, functionApp.id, roleStorageTableDataContributor)
  scope: storage
  properties: {
    principalId: functionApp.identity.principalId
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roleStorageTableDataContributor)
    principalType: 'ServicePrincipal'
  }
}

// Function App identity → Key Vault (read secrets at runtime).
resource fnKeyVault 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(keyVault.id, functionApp.id, roleKeyVaultSecretsUser)
  scope: keyVault
  properties: {
    principalId: functionApp.identity.principalId
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roleKeyVaultSecretsUser)
    principalType: 'ServicePrincipal'
  }
}

// Function App identity → App Insights (publish metrics).
resource fnAppInsights 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(appInsights.id, functionApp.id, roleMonitoringMetricsPublisher)
  scope: appInsights
  properties: {
    principalId: functionApp.identity.principalId
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roleMonitoringMetricsPublisher)
    principalType: 'ServicePrincipal'
  }
}

// Deploy identity → Function App (push code).
resource deployFunctionApp 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(functionApp.id, deployIdentityPrincipalId, roleWebsiteContributor)
  scope: functionApp
  properties: {
    principalId: deployIdentityPrincipalId
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roleWebsiteContributor)
    principalType: 'ServicePrincipal'
  }
}

// Operator humans → Key Vault Secrets Officer (rotate secrets without portal access policy).
resource opKeyVault 'Microsoft.Authorization/roleAssignments@2022-04-01' = [for principalId in keyVaultAdminPrincipalIds: {
  name: guid(keyVault.id, principalId, roleKeyVaultSecretsOfficer)
  scope: keyVault
  properties: {
    principalId: principalId
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roleKeyVaultSecretsOfficer)
    principalType: 'User'
  }
}]

// --------------------------------------------------------------------
// Outputs — consumed by the deploy workflow for URL surfacing.
// --------------------------------------------------------------------
output functionAppName string = functionApp.name
output functionAppDefaultHostName string = functionApp.properties.defaultHostName
output storageAccountName string = storage.name
output keyVaultName string = keyVault.name
output keyVaultUri string = keyVault.properties.vaultUri
output appInsightsName string = appInsights.name
output staticSiteName string = deployStaticWebApp ? staticSite.name : ''
output staticSiteDefaultHostName string = deployStaticWebApp ? staticSite.properties.defaultHostname : ''
