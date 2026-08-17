@description('Deployed with scope set to the Prometheus dev resource group by main.bicep.')
param location string
param tags object
param names object

@secure()
param postgresAdminPassword string

param deployApps bool = false
param useDirectCredentials bool = false

param containerRegistryAdminUsername string = ''
@secure()
param containerRegistryAdminPassword string = ''

param sharedContainerAppsEnvironmentResourceGroup string
param sharedContainerAppsEnvironmentName string

@secure()
param databaseUrlDirect string = ''
@secure()
param authSecretValue string = ''
@secure()
param extensionJwtSecretValue string = ''
@secure()
param openaiApiKey string = ''
@secure()
param paypalClientId string = ''
@secure()
param paypalClientSecret string = ''
param paypalApiBase string = 'https://api-m.paypal.com'
param paypalWebhookId string = ''
@secure()
param cronSecretValue string = ''
@secure()
param makeExpiryWebhookUrl string = ''
@secure()
param makeVerificationWebhookUrl string = ''

// Cross-resource-group reference to organizational-singularity's existing
// Container Apps Environment -- Prometheus deploys into it rather than
// provisioning a second one (see main.bicep's param description for why).
resource sharedEnv 'Microsoft.App/managedEnvironments@2024-03-01' existing = {
  name: sharedContainerAppsEnvironmentName
  scope: resourceGroup(sharedContainerAppsEnvironmentResourceGroup)
}

module postgres '../../modules/postgresql-flexible.bicep' = {
  name: 'deploy-postgres'
  params: {
    name: names.postgres
    location: location
    tags: tags
    administratorLogin: 'prometheus_admin'
    administratorPassword: postgresAdminPassword
  }
}

module containerRegistry '../../modules/container-registry.bicep' = {
  name: 'deploy-acr'
  params: {
    name: names.containerRegistry
    location: location
    tags: tags
    sku: 'Basic'
    adminUserEnabled: useDirectCredentials
  }
}

module keyVault '../../modules/key-vault.bicep' = {
  name: 'deploy-key-vault'
  params: {
    name: names.keyVault
    location: location
    tags: tags
  }
}

var appUrl = 'https://${names.webApp}.${sharedEnv.properties.defaultDomain}'

var webAppPlainSecrets = [
  { name: 'DATABASE_URL', value: databaseUrlDirect }
  { name: 'AUTH_SECRET', value: authSecretValue }
  { name: 'EXTENSION_JWT_SECRET', value: extensionJwtSecretValue }
  { name: 'OPENAI_API_KEY', value: openaiApiKey }
  { name: 'PAYPAL_CLIENT_ID', value: paypalClientId }
  { name: 'PAYPAL_CLIENT_SECRET', value: paypalClientSecret }
  { name: 'CRON_SECRET', value: cronSecretValue }
  { name: 'MAKE_EXPIRY_WEBHOOK_URL', value: makeExpiryWebhookUrl }
  { name: 'MAKE_VERIFICATION_WEBHOOK_URL', value: makeVerificationWebhookUrl }
]

module webApp '../../modules/container-app.bicep' = if (deployApps) {
  name: 'deploy-web'
  params: {
    name: names.webApp
    location: location
    tags: tags
    containerAppsEnvironmentId: sharedEnv.id
    image: '${containerRegistry.outputs.loginServer}/prometheus-web:latest'
    targetPort: 3000
    registryLoginServer: containerRegistry.outputs.loginServer
    registryUsername: useDirectCredentials ? containerRegistryAdminUsername : ''
    registryPassword: useDirectCredentials ? containerRegistryAdminPassword : ''
    environmentVariables: [
      { name: 'NEXT_PUBLIC_APP_URL', value: appUrl }
      { name: 'PAYPAL_API_BASE', value: paypalApiBase }
      { name: 'PAYPAL_WEBHOOK_ID', value: paypalWebhookId }
      { name: 'NODE_ENV', value: 'production' }
    ]
    plainSecrets: webAppPlainSecrets
  }
}

// Replaces vercel.json's cron entry (`0 13 * * *` -> 1pm UTC daily) by
// curl-ing the deployed web app's own /api/cron/expiry-reminders route with
// the same bearer CRON_SECRET header Vercel Cron used to attach
// automatically -- the route's logic is unchanged, only what triggers it.
// Public curl image, no registry credentials needed for this one.
module expiryReminderJob '../../modules/container-app-job.bicep' = if (deployApps) {
  name: 'deploy-expiry-job'
  params: {
    name: names.cronJob
    location: location
    tags: tags
    containerAppsEnvironmentId: sharedEnv.id
    image: 'docker.io/curlimages/curl:latest'
    triggerType: 'Schedule'
    cronExpression: '0 13 * * *'
    command: [
      'sh'
      '-c'
      'curl -fsS -X GET -H "Authorization: Bearer $CRON_SECRET" "$TARGET_URL/api/cron/expiry-reminders"'
    ]
    environmentVariables: [
      { name: 'TARGET_URL', value: appUrl }
    ]
    plainSecrets: [
      { name: 'CRON_SECRET', value: cronSecretValue }
    ]
  }
}

output containerRegistryLoginServer string = containerRegistry.outputs.loginServer
output webAppFqdn string = deployApps ? webApp.outputs.fqdn : ''
output postgresFqdn string = postgres.outputs.fullyQualifiedDomainName
output keyVaultUri string = keyVault.outputs.vaultUri
