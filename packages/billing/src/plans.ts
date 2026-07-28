export interface BillingPlanDefinition {
  code: string;
  name: string;
  /** Decimal string, PayPal's format (e.g. "1.00"). */
  monthlyPrice: string;
  currency: string;
  monthlyRequestLimit: number;
  monthlyTokenLimit: number;
  maximumInputLength: number;
}

/**
 * Placeholder tiers (plan doc section 9: Free/Pro, Team deferred). Pricing
 * is explicitly a placeholder — the doc says not to finalize pricing until
 * OpenAI cost, PayPal fees, and margin are modeled. This is tested against
 * a live PayPal account, so every test payment is a real charge.
 *
 * Each paid tier is a one-time payment (PayPal Orders API) granting 30 days
 * of access, not a recurring subscription — PayPal Subscriptions require a
 * "Reference Transactions" capability most Business accounts don't have
 * enabled by default. See packages/billing/src/access.ts for how the
 * 30-day window is tracked and expired.
 */
export const BILLING_PLAN_DEFINITIONS: BillingPlanDefinition[] = [
  {
    code: 'free',
    name: 'Free',
    monthlyPrice: '0.00',
    currency: 'USD',
    monthlyRequestLimit: 20,
    monthlyTokenLimit: 50_000,
    maximumInputLength: 2000,
  },
  {
    code: 'pro',
    name: 'Pro',
    monthlyPrice: '20.00',
    currency: 'USD',
    monthlyRequestLimit: 500,
    monthlyTokenLimit: 1_000_000,
    maximumInputLength: 4000,
  },
  {
    code: 'business',
    name: 'Business',
    monthlyPrice: '50.00',
    currency: 'USD',
    monthlyRequestLimit: 1500,
    monthlyTokenLimit: 3_000_000,
    maximumInputLength: 4000,
  },
  {
    code: 'enterprise',
    name: 'Enterprise',
    monthlyPrice: '100.00',
    currency: 'USD',
    monthlyRequestLimit: 5000,
    monthlyTokenLimit: 10_000_000,
    maximumInputLength: 4000,
  },
];
