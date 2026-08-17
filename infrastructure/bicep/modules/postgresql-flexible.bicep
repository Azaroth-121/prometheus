param name string
param location string
param tags object = {}

param administratorLogin string

@secure()
param administratorPassword string

@description('Burstable is the low-cost MVP tier -- matches organizational-singularity\'s own dev Postgres.')
param skuName string = 'Standard_B1ms'
param skuTier string = 'Burstable'

param storageSizeGB int = 32
param postgresVersion string = '16'
param databaseName string = 'prometheus'

resource server 'Microsoft.DBforPostgreSQL/flexibleServers@2024-08-01' = {
  name: name
  location: location
  tags: tags
  sku: {
    name: skuName
    tier: skuTier
  }
  properties: {
    version: postgresVersion
    administratorLogin: administratorLogin
    administratorLoginPassword: administratorPassword
    storage: {
      storageSizeGB: storageSizeGB
    }
    backup: {
      backupRetentionDays: 7
      geoRedundantBackup: 'Disabled'
    }
    highAvailability: {
      mode: 'Disabled'
    }
  }

  resource database 'databases@2024-08-01' = {
    name: databaseName
    properties: {
      charset: 'UTF8'
      collation: 'en_US.utf8'
    }
  }

  // Dev-only convenience: allow Azure services (Container Apps) to reach the server.
  // Tighten to VNet integration / private endpoints as this moves toward production.
  resource allowAzureServices 'firewallRules@2024-08-01' = {
    name: 'AllowAzureServices'
    properties: {
      startIpAddress: '0.0.0.0'
      endIpAddress: '0.0.0.0'
    }
  }
}

output serverId string = server.id
output fullyQualifiedDomainName string = server.properties.fullyQualifiedDomainName
