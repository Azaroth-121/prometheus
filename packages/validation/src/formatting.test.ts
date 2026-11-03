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
});
