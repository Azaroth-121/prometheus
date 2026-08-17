@description('Container Apps Job -- replaces Vercel Cron for the expiry-reminders route. The route itself is unchanged (still authenticates via a bearer CRON_SECRET header); only the trigger mechanism moves from Vercel\'s platform cron to this Scheduled-trigger job.')
param name string
param location string
param tags object = {}

param containerAppsEnvironmentId string
param image string
param environmentVariables array = []

@description('Secret environment variables, e.g. [{ name: \'CRON_SECRET\', value: \'...\' }] -- same plain-value bypass pattern as container-app.bicep, for the same reason (no roleAssignments/write while the subscription restriction is active).')
param plainSecrets array = []

@allowed(['Manual', 'Schedule', 'Event'])
param triggerType string = 'Schedule'

@description('Required when triggerType is Schedule, e.g. \'0 13 * * *\' for 1pm UTC daily -- matches the old vercel.json cron schedule.')
param cronExpression string = ''

param cpu string = '0.5'
param memory string = '1Gi'

@description('Leave empty for a public image (e.g. Docker Hub curl) -- no registries block gets attached at all in that case, so this job never needs registry credentials for a job whose whole purpose is one HTTP call.')
param registryLoginServer string = ''

@description('ACR admin username -- same direct-credentials bypass as container-app.bicep. Only relevant if registryLoginServer is set.')
param registryUsername string = ''

@secure()
param registryPassword string = ''

@description('Overrides the image\'s default entrypoint, e.g. [\'sh\', \'-c\', \'curl -f ...\'].')
param command array = []

var secretEntries = [for s in plainSecrets: {
  name: toLower(replace(s.name, '_', '-'))
  value: s.value
}]

var registryPasswordSecret = !empty(registryUsername) ? [{
  name: '${name}-registry-password'
  value: registryPassword
}] : []

var secrets = concat(secretEntries, registryPasswordSecret)

var secretEnvVars = [for s in plainSecrets: { name: s.name, secretRef: toLower(replace(s.name, '_', '-')) }]

var registryConfig = !empty(registryUsername) ? [{
  server: registryLoginServer
  username: registryUsername
  passwordSecretRef: '${name}-registry-password'
}] : !empty(registryLoginServer) ? [{
  server: registryLoginServer
  identity: 'system'
}] : []

resource job 'Microsoft.App/jobs@2024-03-01' = {
  name: name
  location: location
  tags: tags
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    environmentId: containerAppsEnvironmentId
    configuration: {
      triggerType: triggerType
      replicaTimeout: 300
      replicaRetryLimit: 1
      scheduleTriggerConfig: triggerType == 'Schedule' ? {
        cronExpression: cronExpression
        parallelism: 1
        replicaCompletionCount: 1
      } : null
      registries: registryConfig
      secrets: secrets
    }
    template: {
      containers: [
        {
          name: name
          image: image
          command: empty(command) ? null : command
          resources: {
            cpu: json(cpu)
            memory: memory
          }
          env: concat(environmentVariables, secretEnvVars)
        }
      ]
    }
  }
}

output principalId string = job.identity.principalId
output jobId string = job.id
