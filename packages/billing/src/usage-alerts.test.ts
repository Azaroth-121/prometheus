import { describe, expect, it } from 'vitest';
import { usageThresholdReached } from './usage-alerts';

const limits = { requests: 1000, tokens: 2_000_000 };

describe('usageThresholdReached', () => {
  it('is null below 80% of both limits', () => {
    expect(usageThresholdReached({ requests: 799, tokens: 1_599_999 }, limits)).toBeNull();
  });

  it('reaches 80% on either requests or tokens', () => {
    expect(usageThresholdReached({ requests: 800, tokens: 0 }, limits)).toBe(80);
    expect(usageThresholdReached({ requests: 0, tokens: 1_600_000 }, limits)).toBe(80);
  });

  it('reaches 100% at or past either limit', () => {
    expect(usageThresholdReached({ requests: 1000, tokens: 0 }, limits)).toBe(100);
    // The last request can overshoot the token limit; that is still 100%.
    expect(usageThresholdReached({ requests: 10, tokens: 2_100_000 }, limits)).toBe(100);
  });

  it('treats a zero limit as nothing to alert on', () => {
    expect(usageThresholdReached({ requests: 5, tokens: 5 }, { requests: 0, tokens: 0 })).toBeNull();
  });
});
