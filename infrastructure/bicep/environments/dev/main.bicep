targetScope = 'subscription'

@description('Short region code, e.g. eus2.')
param regionCode string = 'eus2'
param location string = 'eastus2'
param instance string = '01'

@secure()
param postgresAdminPassword string

param budgetContactEmails array

@description('Phase 2 of the first deployment: the Container App and Job reference an image that must already be pushed to the registry. Leave false until it is.')
param deployApps bool = false

@description('Temporary bypass while this subscription refuses new roleAssignments/write calls (same restriction hit on organizational-singularity\'s deployment -- confirmed live, not project-specific). When true, the container app/job pull via ACR admin credentials and read secrets as plain values instead of Key Vault. Flip back to false once role assignments work again and redeploy to restore the managed-identity design.')
param useDirectCredentials bool = false

param containerRegistryAdminUsername string = ''
@secure()
param containerRegistryAdminPassword string = ''

@description('Reference to organizational-singularity\'s existing Container Apps Environment -- Prometheus deploys into it rather than provisioning its own, since this subscription may only allow one environment. Same subscription, different resource group.')
param sharedContainerAppsEnvironmentResourceGroup string = 'rg-os-dev-eus2-01'
param sharedContainerAppsEnvironmentName string = 'cae-os-core-dev-eus2-01'

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

var env = 'dev'
var tags = {
  application: 'prometheus'
  environment: env
  owner: 'platform-engineering'
  costCenter: 'product-rnd'
  dataClassification: 'confidential'
  managedBy: 'bicep'
  criticality: 'low'
}

var names = {
  resourceGroup: 'rg-prometheus-${env}-${regionCode}-${instance}'
  postgres: 'psql-prometheus-core-${env}-${regionCode}-${instance}'
  containerRegistry: 'acrprometheus${env}${regionCode}${instance}'
  webApp: 'ca-prometheus-web-${env}-${regionCode}-${instance}'
  cronJob: 'caj-prometheus-expiry-${env}-${regionCode}-${instance}'
  keyVault: 'kv-prometheus-core-${env}-${regionCode}-${instance}'
  budget: 'budget-prometheus-${env}'
}

module resourceGroup '../../modules/resource-group-baseline.bicep' = {
  name: 'deploy-rg'
  params: {
    name: names.resourceGroup
    location: location
    tags: tags
  }
}

module budget '../../modules/budgets-alerts.bicep' = {
  name: 'deploy-budget'
  params: {
    budgetName: names.budget
    amount: 50
    contactEmails: budgetContactEmails
    resourceGroupFilter: names.resourceGroup
  }
  dependsOn: [
    resourceGroup
  ]
}

module resources 'resources.bicep' = {
  name: 'deploy-dev-resources'
  scope: az.resourceGroup(names.resourceGroup)
  params: {
    location: location
    tags: tags
    names: names
    postgresAdminPassword: postgresAdminPassword
    deployApps: deployApps
    useDirectCredentials: useDirectCredentials
    containerRegistryAdminUsername: containerRegistryAdminUsername
    containerRegistryAdminPassword: containerRegistryAdminPassword
    sharedContainerAppsEnvironmentResourceGroup: sharedContainerAppsEnvironmentResourceGroup
    sharedContainerAppsEnvironmentName: sharedContainerAppsEnvironmentName
    databaseUrlDirect: databaseUrlDirect
    authSecretValue: authSecretValue
    extensionJwtSecretValue: extensionJwtSecretValue
    openaiApiKey: openaiApiKey
    paypalClientId: paypalClientId
    paypalClientSecret: paypalClientSecret
    paypalApiBase: paypalApiBase
    paypalWebhookId: paypalWebhookId
    cronSecretValue: cronSecretValue
    makeExpiryWebhookUrl: makeExpiryWebhookUrl
    makeVerificationWebhookUrl: makeVerificationWebhookUrl
  }
  dependsOn: [
    resourceGroup
  ]
}

output resourceGroupName string = names.resourceGroup
output containerRegistryLoginServer string = resources.outputs.containerRegistryLoginServer
output webAppFqdn string = resources.outputs.webAppFqdn
output postgresFqdn string = resources.outputs.postgresFqdn
