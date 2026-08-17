param name string
param location string
param tags object = {}

@description('Basic is sufficient for dev/internal; consider Standard/Premium for prod (geo-replication, private endpoints).')
@allowed(['Basic', 'Standard', 'Premium'])
param sku string = 'Basic'

@description('Off by default (managed identity + AcrPull is the correct design). Only needed while the direct-credentials bypass is active -- otherwise every redeploy silently resets an out-of-band `az acr update --admin-enabled true` back to false, invalidating credentials mid-deployment. Learned the hard way on organizational-singularity\'s own deployment -- built in correctly from the start here.')
param adminUserEnabled bool = false

resource registry 'Microsoft.ContainerRegistry/registries@2023-11-01-preview' = {
  name: name
  location: location
  tags: tags
  sku: {
    name: sku
  }
  properties: {
    adminUserEnabled: adminUserEnabled
  }
}

output registryId string = registry.id
output loginServer string = registry.properties.loginServer
