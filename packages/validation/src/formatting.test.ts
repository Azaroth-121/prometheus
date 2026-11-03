import { describe, expect, it } from 'vitest';
import { plainTextPrompt } from './formatting';

describe('plainTextPrompt', () => {
  it('removes bold markers and heading hashes', () => {
    const input = '### Guide\n\n1. **Introduction to Rust**: Explain why.\n2. __Setup__: Install it.';
    expect(plainTextPrompt(input)).toBe('Guide\n\n1. Introduction to Rust: Explain why.\n2. Setup: Install it.');
  });

  it('keeps bullets, multiplication, numbered lists and line breaks', () => {
    const input = '* first point\n* second point\nUse 5 * 3 items.\n1. Step one';
    expect(plainTextPrompt(input)).toBe(input);
  });

  it('leaves unmatched or spaced asterisks alone', () => {
    expect(plainTextPrompt('a ** b and c**')).toBe('a ** b and c**');
    expect(plainTextPrompt('**bold\nacross lines**')).toBe('**bold\nacross lines**');
  });

  it('does not treat a hash without a following space as a heading', () => {
    expect(plainTextPrompt('#hashtag and C# code')).toBe('#hashtag and C# code');
  });

  it('puts an inline numbered list onto separate lines', () => {
    expect(plainTextPrompt('Create a plan with: 1. Objective: Define it. 2. Scope: Outline areas. 3. Resources: List them.')).toBe(
      'Create a plan with:\n\n1. Objective: Define it.\n2. Scope: Outline areas.\n3. Resources: List them.',
    );
  });

  it('leaves version numbers, decimals, a single item and existing lists alone', () => {
    expect(plainTextPrompt('Use v2. format and 3.5 hours.')).toBe('Use v2. format and 3.5 hours.');
    expect(plainTextPrompt('Only 1. Item here.')).toBe('Only 1. Item here.');
    expect(plainTextPrompt('Steps:\n1. One\n2. Two')).toBe('Steps:\n1. One\n2. Two');
  });
});
