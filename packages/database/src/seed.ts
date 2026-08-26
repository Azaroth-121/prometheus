import { sql } from 'drizzle-orm';
import { createDatabaseClient, plans } from './client';

/**
 * Seeds the `plans` table from packages/billing/src/plans.ts's
 * BILLING_PLAN_DEFINITIONS -- the single source of truth for tier limits.
 *
 * No seed for this table existed anywhere in the Supabase-era repo; rows
 * were only ever entered by hand in the Supabase Dashboard. This closes that
 * gap regardless of the Azure migration, not because of it.
 *
 * Idempotent: safe to run on every deploy (upserts by `code`, the same
 * uniqueness the schema itself enforces).
 *
 * Usage: $env:DATABASE_URL = "postgres://..."; pnpm --filter @prometheus/database run db:seed
 */

// Duplicated here rather than imported from @prometheus/billing to avoid a
// circular workspace dependency (billing already depends on database for its
// query helpers). Keep in sync with packages/billing/src/plans.ts by hand --
// small, rarely-changed list.
//
// providerPlanId: the Stripe recurring Price id (price_...) for each paid
// tier. IMPORTANT: these are LIVE-MODE ids -- see the matching note in
// packages/billing/src/plans.ts for the test-mode equivalents to use when
// seeding a local dev database against a sk_test_... key.
const BILLING_PLAN_DEFINITIONS = [
  { code: 'free', name: 'Free', monthlyPrice: '0.00', currency: 'USD', monthlyRequestLimit: 20, monthlyTokenLimit: 50_000, maximumInputLength: 2000, providerPlanId: null as string | null },
  { code: 'pro', name: 'Pro', monthlyPrice: '20.00', currency: 'USD', monthlyRequestLimit: 500, monthlyTokenLimit: 1_000_000, maximumInputLength: 4000, providerPlanId: 'price_1U8jE9IM9o3mvQy9LQoPIPqv' as string | null },
  { code: 'business', name: 'Business', monthlyPrice: '50.00', currency: 'USD', monthlyRequestLimit: 1500, monthlyTokenLimit: 3_000_000, maximumInputLength: 4000, providerPlanId: 'price_1U8jEAIM9o3mvQy9LXWJRWIe' as string | null },
  { code: 'enterprise', name: 'Enterprise', monthlyPrice: '100.00', currency: 'USD', monthlyRequestLimit: 5000, monthlyTokenLimit: 10_000_000, maximumInputLength: 4000, providerPlanId: 'price_1U8jEBIM9o3mvQy99t61ea0R' as string | null },
];

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is required to seed plans.');
  }

  const db = createDatabaseClient(connectionString);

  for (const plan of BILLING_PLAN_DEFINITIONS) {
    await db
      .insert(plans)
      .values({
        name: plan.name,
        code: plan.code,
        monthlyPrice: plan.monthlyPrice,
        currency: plan.currency,
        monthlyRequestLimit: plan.monthlyRequestLimit,
        monthlyTokenLimit: plan.monthlyTokenLimit,
        maximumInputLength: plan.maximumInputLength,
        providerPlanId: plan.providerPlanId,
      })
      .onConflictDoUpdate({
        target: plans.code,
        set: {
          name: sql`excluded.name`,
          monthlyPrice: sql`excluded.monthly_price`,
          currency: sql`excluded.currency`,
          monthlyRequestLimit: sql`excluded.monthly_request_limit`,
          monthlyTokenLimit: sql`excluded.monthly_token_limit`,
          maximumInputLength: sql`excluded.maximum_input_length`,
          // Only overwrite if this run actually provides a value -- keeps a
          // previously-configured Stripe Price id from being wiped out by a
          // re-run of the seed that hasn't been updated with it yet.
          providerPlanId: plan.providerPlanId ? sql`excluded.provider_plan_id` : sql`plans.provider_plan_id`,
        },
      });
    console.log(`Seeded plan: ${plan.code}`);
  }

  console.log('Done.');
  process.exit(0);
}

main().catch((error) => {
  console.error('Seed failed:', error);
  process.exit(1);
});
