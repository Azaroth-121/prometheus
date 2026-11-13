import { describe, expect, it } from 'vitest';
import { ORGANIZATION_LICENSE_MAX, ORGANIZATION_LICENSE_MIN, parseLicenseQuantity } from './licenses';

describe('parseLicenseQuantity', () => {
  it('defaults to one license for individuals and the minimum for organizations', () => {
    expect(parseLicenseQuantity(undefined, 'individual')).toEqual({ ok: true, quantity: 1 });
    expect(parseLicenseQuantity(null, 'organization')).toEqual({ ok: true, quantity: ORGANIZATION_LICENSE_MIN });
  });

  it('accepts an organization quantity within bounds', () => {
    expect(parseLicenseQuantity(25, 'organization')).toEqual({ ok: true, quantity: 25 });
    expect(parseLicenseQuantity(ORGANIZATION_LICENSE_MAX, 'organization')).toEqual({ ok: true, quantity: ORGANIZATION_LICENSE_MAX });
  });

  it('rejects organization quantities outside bounds', () => {
    expect(parseLicenseQuantity(ORGANIZATION_LICENSE_MIN - 1, 'organization').ok).toBe(false);
    expect(parseLicenseQuantity(ORGANIZATION_LICENSE_MAX + 1, 'organization').ok).toBe(false);
  });

  it('rejects anything that is not a whole number', () => {
    expect(parseLicenseQuantity(2.5, 'organization').ok).toBe(false);
    expect(parseLicenseQuantity('10', 'organization').ok).toBe(false);
    expect(parseLicenseQuantity(Number.NaN, 'organization').ok).toBe(false);
  });

  it('only allows a single license on individual plans', () => {
    expect(parseLicenseQuantity(1, 'individual')).toEqual({ ok: true, quantity: 1 });
    expect(parseLicenseQuantity(5, 'individual').ok).toBe(false);
  });
});
