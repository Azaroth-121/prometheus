import { describe, expect, it } from 'vitest';
import { summarizeSubscriptions, type DashboardSubscription } from './dashboard-metrics';

const now = new Date('2026-11-12T12:00:00Z');
const since = new Date('2026-10-13T00:00:00Z');

function subscription(overrides: Partial<DashboardSubscription> = {}): DashboardSubscription {
  return {
    id: 'sub_1',
    status: 'active',
    createdAt: new Date('2026-11-01T00:00:00Z'),
    periodEnd: new Date('2026-12-01T00:00:00Z'),
    plan: 'Pro',
    price: '20.00',
    currency: 'usd',
    ...overrides,
  };
}

describe('summarizeSubscriptions', () => {
  it('counts a migrated provider subscription once, preferring the organization row', () => {
    const result = summarizeSubscriptions(
      [subscription({ id: 'sub_shared', plan: 'Team', price: '80.00' })],
      [
        subscription({ id: 'sub_shared', plan: 'Pro', price: '20.00' }),
        subscription({ id: 'sub_personal', createdAt: new Date('2026-09-01T00:00:00Z') }),
      ],
      now,
      since
    );

    expect(result.activeCount).toBe(2);
    expect(result.newCount).toBe(1);
    expect(result.monthlyUsdValue).toBe(100);
    expect([...result.planMix.entries()]).toEqual([
      ['Organization · Team', 1],
      ['Individual · Pro', 1],
    ]);
  });

  it('excludes expired, canceled and non-USD value without hiding their counts', () => {
    const result = summarizeSubscriptions(
      [
        subscription({ id: 'sub_expired', periodEnd: new Date('2026-11-01T00:00:00Z') }),
        subscription({ id: 'sub_eur', currency: 'eur', price: '50.00' }),
      ],
      [
        subscription({ id: 'sub_canceled', status: 'canceled' }),
        subscription({ id: 'sub_usd', price: '30.00' }),
      ],
      now,
      since
    );

    expect(result.activeCount).toBe(2);
    expect(result.canceledCount).toBe(1);
    expect(result.monthlyUsdValue).toBe(30);
    expect(result.excludedNonUsdCount).toBe(1);
  });
});
