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
 * OpenAI cost, PayPal fees, and margin are modeled. "Pro" is priced nominal
 * on purpose: this is tested against a live PayPal account, so every test
 * subscription is a real charge.
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
    monthlyPrice: '1.00',
    currency: 'USD',
    monthlyRequestLimit: 500,
    monthlyTokenLimit: 1_000_000,
    maximumInputLength: 4000,
  },
];
