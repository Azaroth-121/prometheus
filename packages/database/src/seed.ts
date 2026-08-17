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
 * Usage: DATABASE_URL=postgres://... pnpm --filter @prometheus/database exec tsx src/seed.ts
 */

// Duplicated here rather than imported from @prometheus/billing to avoid a
// circular workspace dependency (billing already depends on database for its
// query helpers). Keep in sync with packages/billing/src/plans.ts by hand --
// small, rarely-changed list.
const BILLING_PLAN_DEFINITIONS = [
  { code: 'free', name: 'Free', monthlyPrice: '0.00', currency: 'USD', monthlyRequestLimit: 20, monthlyTokenLimit: 50_000, maximumInputLength: 2000 },
  { code: 'pro', name: 'Pro', monthlyPrice: '20.00', currency: 'USD', monthlyRequestLimit: 500, monthlyTokenLimit: 1_000_000, maximumInputLength: 4000 },
  { code: 'business', name: 'Business', monthlyPrice: '50.00', currency: 'USD', monthlyRequestLimit: 1500, monthlyTokenLimit: 3_000_000, maximumInputLength: 4000 },
  { code: 'enterprise', name: 'Enterprise', monthlyPrice: '100.00', currency: 'USD', monthlyRequestLimit: 5000, monthlyTokenLimit: 10_000_000, maximumInputLength: 4000 },
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
