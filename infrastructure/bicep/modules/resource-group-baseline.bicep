targetScope = 'subscription'

@description('Resource group name, e.g. rg-prometheus-dev-eus2-01')
param name string

param location string

param tags object

resource rg 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: name
  location: location
  tags: tags
}

output resourceGroupName string = rg.name
output resourceGroupId string = rg.id
