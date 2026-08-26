using 'main.bicep'

param regionCode = 'eus2'
param location = 'eastus2'
param instance = '01'

param budgetContactEmails = ['iamkurtrainiersacay@gmail.com']

param deployApps = false
param useDirectCredentials = false

// All secrets below are read from environment variables, never committed --
// same discipline as organizational-singularity's dev.bicepparam. Set each
// as PROMETHEUS_<NAME> before running `az deployment sub create`.
param postgresAdminPassword = readEnvironmentVariable('PROMETHEUS_POSTGRES_ADMIN_PASSWORD')
param containerRegistryAdminUsername = readEnvironmentVariable('PROMETHEUS_ACR_ADMIN_USERNAME', '')
param containerRegistryAdminPassword = readEnvironmentVariable('PROMETHEUS_ACR_ADMIN_PASSWORD', '')
param databaseUrlDirect = readEnvironmentVariable('PROMETHEUS_DATABASE_URL_DIRECT', '')
param authSecretValue = readEnvironmentVariable('PROMETHEUS_AUTH_SECRET', '')
param extensionJwtSecretValue = readEnvironmentVariable('PROMETHEUS_EXTENSION_JWT_SECRET', '')
param openaiApiKey = readEnvironmentVariable('PROMETHEUS_OPENAI_API_KEY', '')
param stripeSecretKey = readEnvironmentVariable('PROMETHEUS_STRIPE_SECRET_KEY', '')
param stripeWebhookSecret = readEnvironmentVariable('PROMETHEUS_STRIPE_WEBHOOK_SECRET', '')
param cronSecretValue = readEnvironmentVariable('PROMETHEUS_CRON_SECRET', '')
param makeExpiryWebhookUrl = readEnvironmentVariable('PROMETHEUS_MAKE_EXPIRY_WEBHOOK_URL', '')
param makeVerificationWebhookUrl = readEnvironmentVariable('PROMETHEUS_MAKE_VERIFICATION_WEBHOOK_URL', '')
