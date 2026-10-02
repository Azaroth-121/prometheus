import { and, eq, gte, sql } from 'drizzle-orm';
import { optimizationRequests, plans, profiles, subscriptions } from '@prometheus/database';
import { Card } from '@prometheus/ui';
import { db } from '@/lib/db';

function startOfToday(): Date {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  return start;
}

function startOfLastThirtyDays(): Date {
  const start = startOfToday();
  start.setUTCDate(start.getUTCDate() - 29);
  return start;
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <p className="text-sm text-ink-muted">{label}</p>
      <p className="text-2xl font-semibold text-ink">{value}</p>
    </Card>
  );
}

export default async function AdminOverviewPage() {
  // Gated by admin/layout.tsx (requireAdmin-equivalent) -- no RLS backstop
  // anymore, so that layout check is the only thing standing between this
  // page and every user's data. See known-technical-debt-style note: worth
  // a dedicated test confirming a non-admin can't reach this route.
  const [userCountRow] = await db.select({ totalUsers: sql<number>`count(*)::int` }).from(profiles);
  const totalUsers = userCountRow?.totalUsers ?? 0;

  const todaysRequests = await db
    .select({ status: optimizationRequests.status, errorCode: optimizationRequests.errorCode })
    .from(optimizationRequests)
    .where(gte(optimizationRequests.createdAt, startOfToday()));

  const requestsToday = todaysRequests.length;
  const failedToday = todaysRequests.filter((r) => r.status === 'failed').length;
  const guardrailFailedToday = todaysRequests.filter(
    (r) => r.errorCode === 'GUARDRAIL_VALIDATION_FAILED'
  ).length;

  const errorRate = requestsToday === 0 ? 0 : (failedToday / requestsToday) * 100;
  const guardrailFailureRate = requestsToday === 0 ? 0 : (guardrailFailedToday / requestsToday) * 100;

  const activeSubscriptions = await db
    .select({
      currency: plans.currency,
      count: sql<number>`count(*)::int`,
      listedMonthlyValue: sql<string>`coalesce(sum(${plans.monthlyPrice}), 0)::text`,
    })
    .from(subscriptions)
    .innerJoin(plans, eq(subscriptions.planId, plans.id))
    .where(and(eq(subscriptions.provider, 'stripe'), eq(subscriptions.status, 'active'), sql`${plans.monthlyPrice} > 0`))
    .groupBy(plans.currency);

  const [costRow] = await db
    .select({
      successfulRequests: sql<number>`count(*)::int`,
      requestsMissingCost: sql<number>`count(*) filter (where ${optimizationRequests.estimatedCost} is null)::int`,
      estimatedCost: sql<string>`coalesce(sum(${optimizationRequests.estimatedCost}), 0)::text`,
      inputTokens: sql<number>`coalesce(sum(${optimizationRequests.inputTokens}), 0)::bigint`,
      outputTokens: sql<number>`coalesce(sum(${optimizationRequests.outputTokens}), 0)::bigint`,
    })
    .from(optimizationRequests)
    .where(and(eq(optimizationRequests.status, 'succeeded'), gte(optimizationRequests.createdAt, startOfLastThirtyDays())));

  const activeSubscriptionCount = activeSubscriptions.reduce((sum, row) => sum + row.count, 0);

  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="operations-heading">
        <h2 id="operations-heading" className="mb-3 text-lg font-semibold text-ink">Operations</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard label="Total users" value={String(totalUsers ?? 0)} />
          <StatCard label="Requests today" value={String(requestsToday)} />
          <StatCard label="Error rate today" value={`${errorRate.toFixed(1)}%`} />
          <StatCard label="Guardrail failure rate today" value={`${guardrailFailureRate.toFixed(1)}%`} />
        </div>
      </section>
      <section aria-labelledby="billing-heading">
        <h2 id="billing-heading" className="mb-3 text-lg font-semibold text-ink">Billing and OpenAI usage</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard label="Active paid subscriptions" value={String(activeSubscriptionCount)} />
          <StatCard
            label="Listed monthly value"
            value={activeSubscriptions.length === 0
              ? '$0.00'
              : activeSubscriptions.map((row) =>
                  new Intl.NumberFormat('en-US', { style: 'currency', currency: row.currency }).format(Number(row.listedMonthlyValue))
                ).join(' · ')}
          />
          <StatCard label="Successful requests · 30 days" value={String(costRow?.successfulRequests ?? 0)} />
          <StatCard
            label="Estimated OpenAI cost · 30 days"
            value={new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(costRow?.estimatedCost ?? 0))}
          />
        </div>
        <p className="mt-3 text-sm text-ink-muted">
          Listed monthly value uses plan prices, not payments received. OpenAI cost is an estimate from recorded request usage.
          {' '}{costRow?.requestsMissingCost ?? 0} successful requests in this period have no cost estimate.
          {' '}Token usage: {Number(costRow?.inputTokens ?? 0).toLocaleString('en-US')} input, {Number(costRow?.outputTokens ?? 0).toLocaleString('en-US')} output.
        </p>
      </section>
    </div>
  );
}
