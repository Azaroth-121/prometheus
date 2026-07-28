/** Easy to swap for a newer/cheaper model without touching the route handler. */
export const PROMETHEUS_MODEL = 'gpt-4o-mini';

/**
 * OpenAI Structured Outputs schema for PrometheusModelOutput
 * (packages/shared-types/src/api.ts). Using response_format: json_schema
 * instead of prompting for JSON and hoping means the shape is guaranteed by
 * the API, not just requested of the model.
 */
export const PROMETHEUS_OUTPUT_JSON_SCHEMA = {
  name: 'prometheus_output',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      improved_prompt: { type: 'string' },
      upgrade_notes: { type: 'array', items: { type: 'string' } },
      classification: {
        type: 'object',
        properties: {
          task_type: { type: 'string' },
          execution_risk: { type: 'boolean' },
        },
        required: ['task_type', 'execution_risk'],
        additionalProperties: false,
      },
    },
    required: ['improved_prompt', 'upgrade_notes', 'classification'],
    additionalProperties: false,
  },
} as const;
