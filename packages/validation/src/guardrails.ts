import type { PrometheusModelOutput } from '@prometheus/shared-types';

export class GuardrailValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GuardrailValidationError';
  }
}

/** Verifies the model's raw JSON matches PrometheusModelOutput's shape. */
export function validateModelOutput(raw: unknown): PrometheusModelOutput {
  if (typeof raw !== 'object' || raw === null) {
    throw new GuardrailValidationError('Model output is not an object.');
  }

  const output = raw as Record<string, unknown>;
  const classification = output.classification as Record<string, unknown> | undefined;

  if (typeof output.improved_prompt !== 'string' || output.improved_prompt.trim().length === 0) {
    throw new GuardrailValidationError('Model output is missing a non-empty "improved_prompt".');
  }
  if (!Array.isArray(output.upgrade_notes) || !output.upgrade_notes.every((n) => typeof n === 'string')) {
    throw new GuardrailValidationError('Model output is missing a string[] "upgrade_notes".');
  }
  if (
    typeof classification !== 'object' ||
    classification === null ||
    typeof classification.task_type !== 'string' ||
    typeof classification.execution_risk !== 'boolean'
  ) {
    throw new GuardrailValidationError('Model output is missing a valid "classification".');
  }

  return {
    improved_prompt: output.improved_prompt,
    upgrade_notes: output.upgrade_notes as string[],
    classification: {
      task_type: classification.task_type,
      execution_risk: classification.execution_risk,
    },
  };
}

const MAX_IMPROVED_PROMPT_LENGTH = 4000;

/**
 * Rule-based execution-leak check (plan doc section 7). Initial pass —
 * the doc itself notes a rule-based validator is sufficient to start,
 * with a secondary model check reserved for uncertain results later.
 */
export const EXECUTION_LEAK_PHRASES = [
  "here is the image",
  "here's the image",
  'the answer is',
  'i have completed',
  "i've completed",
  'i have executed',
  'i have generated the',
  "i've generated the",
  'here is the code you requested',
  "here's the translation",
];

export interface GuardrailCheckResult {
  valid: boolean;
  reason?: string;
}

export function checkExecutionLeak(output: PrometheusModelOutput): GuardrailCheckResult {
  if (output.improved_prompt.length > MAX_IMPROVED_PROMPT_LENGTH) {
    return { valid: false, reason: 'Output exceeds the allowed response size.' };
  }

  if (output.classification.execution_risk) {
    return { valid: false, reason: 'Model self-flagged execution risk.' };
  }

  const haystack = [output.improved_prompt, ...output.upgrade_notes].join('\n').toLowerCase();
  const matchedPhrase = EXECUTION_LEAK_PHRASES.find((phrase) => haystack.includes(phrase));
  if (matchedPhrase) {
    return { valid: false, reason: `Output contains an execution-leak phrase: "${matchedPhrase}".` };
  }

  return { valid: true };
}
