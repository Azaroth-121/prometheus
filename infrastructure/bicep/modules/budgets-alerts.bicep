targetScope = 'subscription'

@description('Monthly budget in the subscription\'s billing currency.')
param amount int

param budgetName string
param contactEmails array

@description('Resource group to scope the budget to; omit (empty string) to scope to the whole subscription.')
param resourceGroupFilter string = ''

resource budget 'Microsoft.Consumption/budgets@2023-11-01' = {
  name: budgetName
  properties: {
    category: 'Cost'
    amount: amount
    timeGrain: 'Monthly'
    timePeriod: {
      startDate: '2026-08-01'
    }
    filter: empty(resourceGroupFilter) ? null : {
      dimensions: {
        name: 'ResourceGroupName'
        operator: 'In'
        values: [resourceGroupFilter]
      }
    }
    notifications: {
      actual_50: {
        enabled: true
        operator: 'GreaterThanOrEqualTo'
        threshold: 50
        contactEmails: contactEmails
        thresholdType: 'Actual'
      }
      actual_75: {
        enabled: true
        operator: 'GreaterThanOrEqualTo'
        threshold: 75
        contactEmails: contactEmails
        thresholdType: 'Actual'
      }
      actual_90: {
        enabled: true
        operator: 'GreaterThanOrEqualTo'
        threshold: 90
        contactEmails: contactEmails
        thresholdType: 'Actual'
      }
      forecasted_100: {
        enabled: true
        operator: 'GreaterThanOrEqualTo'
        threshold: 100
        contactEmails: contactEmails
        thresholdType: 'Forecasted'
      }
    }
  }
}
