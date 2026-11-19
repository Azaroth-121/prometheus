export interface BillingPlanDefinition {
  code: string;
  name: string;
  /** Decimal string (e.g. "20.00"). */
  monthlyPrice: string;
  currency: string;
  monthlyRequestLimit: number;
  monthlyTokenLimit: number;
  maximumInputLength: number;
  /** Stripe recurring Price id (price_...), null for the free tier. Populated once created in the Stripe Dashboard -- see packages/billing/README.md. */
  providerPlanId: string | null;
}

export const BILLING_PLAN_DEFINITIONS: BillingPlanDefinition[] = [
  {
    code: 'free',
    name: 'Free',
    monthlyPrice: '0.00',
    currency: 'USD',
    monthlyRequestLimit: 20,
    monthlyTokenLimit: 50_000,
    maximumInputLength: 2000,
    providerPlanId: null,
  },
  {
    code: 'pro',
    name: 'Pro',
    monthlyPrice: '20.00',
    currency: 'USD',
    monthlyRequestLimit: 500,
    monthlyTokenLimit: 1_000_000,
    maximumInputLength: 4000,
    providerPlanId: 'price_1UdFzCRZEcpp2lnT8fQJSbrU',
  },
  {
    code: 'business',
    name: 'Business',
    monthlyPrice: '50.00',
    currency: 'USD',
    monthlyRequestLimit: 1500,
    monthlyTokenLimit: 3_000_000,
    maximumInputLength: 4000,
    providerPlanId: 'price_1UdFziRZEcpp2lnTc02xjfX2',
  },
  {
    code: 'enterprise',
    name: 'Enterprise',
    monthlyPrice: '100.00',
    currency: 'USD',
    monthlyRequestLimit: 5000,
    monthlyTokenLimit: 10_000_000,
    maximumInputLength: 4000,
    providerPlanId: 'price_1UdG0CRZEcpp2lnT9biJlNxj',
  },
];
