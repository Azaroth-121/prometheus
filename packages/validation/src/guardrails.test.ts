import { describe, expect, it } from 'vitest';
import type { PrometheusModelOutput } from '@prometheus/shared-types';
import { checkExecutionLeak, EXECUTION_LEAK_PHRASES, GuardrailValidationError, validateModelOutput } from './guardrails';

function validOutput(overrides: Partial<PrometheusModelOutput> = {}): PrometheusModelOutput {
  return {
    improved_prompt: 'Write a 600-word blog post about the new feature launch.',
    upgrade_notes: ['Added audience and tone constraints.'],
    classification: { task_type: 'writing', execution_risk: false },
    ...overrides,
  };
}

describe('validateModelOutput', () => {
  it('accepts a well-formed output', () => {
    const raw = validOutput();
    expect(validateModelOutput(raw)).toEqual(raw);
  });

  it('rejects a non-object', () => {
    expect(() => validateModelOutput('not an object')).toThrow(GuardrailValidationError);
    expect(() => validateModelOutput(null)).toThrow(GuardrailValidationError);
  });

  it('rejects a missing or empty improved_prompt', () => {
    expect(() => validateModelOutput({ ...validOutput(), improved_prompt: '' })).toThrow(
      GuardrailValidationError
    );
    expect(() => validateModelOutput({ ...validOutput(), improved_prompt: undefined })).toThrow(
      GuardrailValidationError
    );
  });

  it('rejects a non-array or non-string-array upgrade_notes', () => {
    expect(() => validateModelOutput({ ...validOutput(), upgrade_notes: 'not an array' })).toThrow(
      GuardrailValidationError
    );
    expect(() => validateModelOutput({ ...validOutput(), upgrade_notes: [1, 2] })).toThrow(
      GuardrailValidationError
    );
  });

  it('rejects a missing or malformed classification', () => {
    expect(() => validateModelOutput({ ...validOutput(), classification: undefined })).toThrow(
      GuardrailValidationError
    );
    expect(() =>
      validateModelOutput({ ...validOutput(), classification: { task_type: 'writing' } })
    ).toThrow(GuardrailValidationError);
    expect(() =>
      validateModelOutput({
        ...validOutput(),
        classification: { task_type: 'writing', execution_risk: 'yes' },
      })
    ).toThrow(GuardrailValidationError);
  });
});

describe('checkExecutionLeak', () => {
  it('passes a clean output', () => {
    expect(checkExecutionLeak(validOutput())).toEqual({ valid: true });
  });

  it('blocks output over the size limit', () => {
    const result = checkExecutionLeak(validOutput({ improved_prompt: 'x'.repeat(4001) }));
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/allowed response size/);
  });

  it('blocks output the model self-flagged as an execution risk', () => {
    const result = checkExecutionLeak(
      validOutput({ classification: { task_type: 'writing', execution_risk: true } })
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/execution risk/);
  });

  it.each(EXECUTION_LEAK_PHRASES)('blocks output containing the leak phrase "%s"', (phrase) => {
    const result = checkExecutionLeak(validOutput({ improved_prompt: `Some text. ${phrase} Some more text.` }));
    expect(result.valid).toBe(false);
    expect(result.reason).toContain(phrase);
  });

  it('is case-insensitive when matching leak phrases', () => {
    const result = checkExecutionLeak(validOutput({ improved_prompt: 'THE ANSWER IS 42.' }));
    expect(result.valid).toBe(false);
  });

  it('also checks upgrade_notes for leak phrases, not just improved_prompt', () => {
    const result = checkExecutionLeak(
      validOutput({ upgrade_notes: ["Note: I've completed the task already."] })
    );
    expect(result.valid).toBe(false);
  });
});
