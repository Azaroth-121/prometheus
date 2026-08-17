@description('Scaffolded for when the roleAssignments/write restriction clears and useDirectCredentials reverts to false -- not actively used while the bypass is active.')
param name string
param location string
param tags object = {}

resource vault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: name
  location: location
  tags: tags
  properties: {
    sku: {
      family: 'A'
      name: 'standard'
    }
    tenantId: subscription().tenantId
    enableRbacAuthorization: true
    enableSoftDelete: true
    softDeleteRetentionInDays: 90
    enablePurgeProtection: true
  }
}

output vaultId string = vault.id
output vaultUri string = vault.properties.vaultUri
