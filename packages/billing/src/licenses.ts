/**
 * Bounds for how many organization licenses one checkout can buy (ADR-004,
 * documentation/architecture/organization-licenses.md). Placeholders: the
 * real minimum and the "contact sales" ceiling are an open pricing question.
 */
export const ORGANIZATION_LICENSE_MIN = 1;
export const ORGANIZATION_LICENSE_MAX = 1000;

export type LicenseQuantityResult = { ok: true; quantity: number } | { ok: false; error: string };

/**
 * Validates the license count a checkout request asks for. Individual plans
 * are always a single license; an organization checkout that omits it buys
 * the minimum, which keeps callers that predate licenses working unchanged.
 */
export function parseLicenseQuantity(value: unknown, scope: 'individual' | 'organization'): LicenseQuantityResult {
  if (value === undefined || value === null) {
    return { ok: true, quantity: scope === 'organization' ? ORGANIZATION_LICENSE_MIN : 1 };
  }

  if (typeof value !== 'number' || !Number.isInteger(value)) {
    return { ok: false, error: '"quantity" must be a whole number.' };
  }

  if (scope === 'individual') {
    return value === 1 ? { ok: true, quantity: 1 } : { ok: false, error: 'Individual plans include a single license.' };
  }

  if (value < ORGANIZATION_LICENSE_MIN || value > ORGANIZATION_LICENSE_MAX) {
    return {
      ok: false,
      error: `"quantity" must be between ${ORGANIZATION_LICENSE_MIN} and ${ORGANIZATION_LICENSE_MAX}.`,
    };
  }

  return { ok: true, quantity: value };
}
