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

/**
 * Placeholder tiers (plan doc section 9: Free/Pro, Team deferred). Pricing
 * is explicitly a placeholder -- the doc says not to finalize until OpenAI
 * cost and margin are modeled.
 *
 * Real recurring subscriptions via Stripe Checkout (mode: 'subscription') --
 * see packages/billing/src/access.ts for how the current billing period is
 * tracked, and apps/web/src/app/api/webhooks/stripe/route.ts for how Stripe
 * keeps `status`/period bounds in sync as the source of truth.
 *
 * IMPORTANT: the providerPlanId values below are LIVE-MODE Stripe Price ids.
 * Test and live mode are entirely separate object namespaces in Stripe --
 * these will not resolve against a test secret key. For local dev against a
 * sk_test_... key, temporarily swap in the test-mode equivalents instead:
 *   pro: price_1U8j00IM9o3mvQy9WLZcWd8Y
 *   business: price_1U8j01IM9o3mvQy97ZeO8NFp
 *   enterprise: price_1U8j01IM9o3mvQy9JgEJSSCl
 * (and re-run `pnpm --filter @prometheus/database run db:seed` locally) --
 * do not commit that swap back.
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
    providerPlanId: 'price_1U8jE9IM9o3mvQy9LQoPIPqv',
  },
  {
    code: 'business',
    name: 'Business',
    monthlyPrice: '50.00',
    currency: 'USD',
    monthlyRequestLimit: 1500,
    monthlyTokenLimit: 3_000_000,
    maximumInputLength: 4000,
    providerPlanId: 'price_1U8jEAIM9o3mvQy9LXWJRWIe',
  },
  {
    code: 'enterprise',
    name: 'Enterprise',
    monthlyPrice: '100.00',
    currency: 'USD',
    monthlyRequestLimit: 5000,
    monthlyTokenLimit: 10_000_000,
    maximumInputLength: 4000,
    providerPlanId: 'price_1U8jEBIM9o3mvQy99t61ea0R',
  },
];
