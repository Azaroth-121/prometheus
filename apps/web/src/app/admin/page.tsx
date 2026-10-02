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

function money(value: number, digits = 2): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: digits,
  }).format(value);
}

export default async function AdminOverviewPage() {
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

  const planMix = await db
    .select({ name: plans.name, count: sql<number>`count(*)::int` })
    .from(subscriptions)
    .innerJoin(plans, eq(subscriptions.planId, plans.id))
    .where(and(eq(subscriptions.provider, 'stripe'), eq(subscriptions.status, 'active'), sql`${plans.monthlyPrice} > 0`))
    .groupBy(plans.name)
    .orderBy(sql`count(*) desc`);

  const lastFourteenDays = new Date(startOfToday());
  lastFourteenDays.setUTCDate(lastFourteenDays.getUTCDate() - 13);
  const day = sql<string>`(${optimizationRequests.createdAt} at time zone 'UTC')::date::text`;
  const dailyCosts = await db
    .select({ day, cost: sql<string>`coalesce(sum(${optimizationRequests.estimatedCost}), 0)::text` })
    .from(optimizationRequests)
    .where(and(eq(optimizationRequests.status, 'succeeded'), gte(optimizationRequests.createdAt, lastFourteenDays)))
    .groupBy(day)
    .orderBy(day);

  const modelCosts = await db
    .select({ model: optimizationRequests.model, count: sql<number>`count(*)::int`, cost: sql<string>`coalesce(sum(${optimizationRequests.estimatedCost}), 0)::text` })
    .from(optimizationRequests)
    .where(and(eq(optimizationRequests.status, 'succeeded'), gte(optimizationRequests.createdAt, startOfLastThirtyDays())))
    .groupBy(optimizationRequests.model)
    .orderBy(sql`sum(${optimizationRequests.estimatedCost}) desc nulls last`);

  const costByDay = new Map(dailyCosts.map((row) => [row.day, Number(row.cost)]));
  const chartDays = Array.from({ length: 14 }, (_, offset) => {
    const date = new Date(lastFourteenDays);
    date.setUTCDate(date.getUTCDate() + offset);
    const key = date.toISOString().slice(0, 10);
    return { key, cost: costByDay.get(key) ?? 0, label: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) };
  });
  const peakCost = Math.max(0, ...chartDays.map((row) => row.cost));
  const costCoverage = !costRow?.successfulRequests ? null :
    ((costRow.successfulRequests - costRow.requestsMissingCost) / costRow.successfulRequests) * 100;

  const activeSubscriptionCount = activeSubscriptions.reduce((sum, row) => sum + row.count, 0);

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-glow-cyan">Prometheus / Intelligence</p>
          <h2 className="mt-2 font-display text-3xl font-semibold text-ink">Business overview</h2>
          <p className="mt-2 text-sm text-ink-muted">Subscription mix, usage economics, and operational health.</p>
        </div>
        <span className="rounded-full border border-line bg-surface-raised px-4 py-2 text-xs text-ink-muted">Updated on page load · UTC</span>
      </header>

      <section aria-labelledby="billing-heading">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h3 id="billing-heading" className="text-lg font-semibold text-ink">Business pulse</h3>
          <span className="text-xs text-ink-muted">Current subscriptions · trailing 30 days of usage</span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Card className="min-h-36 border-glow/40 bg-gradient-to-br from-glow-dim/60 to-surface-raised">
            <p className="text-sm text-ink-muted">Active paid subscriptions</p>
            <p className="mt-6 font-display text-3xl font-semibold text-ink">{activeSubscriptionCount.toLocaleString('en-US')}</p>
            <p className="mt-2 text-xs text-ink-muted">Stripe subscriptions marked active</p>
          </Card>
          <Card className="min-h-36">
            <p className="text-sm text-ink-muted">Listed monthly value</p>
            <p className="mt-6 font-display text-3xl font-semibold text-ink">{activeSubscriptions.length === 0 ? '$0.00' : activeSubscriptions.map((row) => new Intl.NumberFormat('en-US', { style: 'currency', currency: row.currency }).format(Number(row.listedMonthlyValue))).join(' · ')}</p>
            <p className="mt-2 text-xs text-ink-muted">Plan prices before discounts and tax</p>
          </Card>
          <Card className="min-h-36">
            <p className="text-sm text-ink-muted">Estimated OpenAI cost</p>
            <p className="mt-6 font-display text-3xl font-semibold text-ink">{money(Number(costRow?.estimatedCost ?? 0), 4)}</p>
            <p className="mt-2 text-xs text-ink-muted">Successful requests · trailing 30 days</p>
          </Card>
          <Card className="min-h-36">
            <p className="text-sm text-ink-muted">Successful requests</p>
            <p className="mt-6 font-display text-3xl font-semibold text-ink">{(costRow?.successfulRequests ?? 0).toLocaleString('en-US')}</p>
            <p className="mt-2 text-xs text-ink-muted">Trailing 30 days from the usage ledger</p>
          </Card>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(280px,1fr)]">
        <Card>
          <h3 className="text-lg font-semibold text-ink">Daily estimated cost</h3>
          <p className="mt-1 text-sm text-ink-muted">Last 14 UTC days, including today</p>
          <div className="mt-8 flex h-40 items-end gap-2 border-b border-line pb-1" role="img" aria-label="Daily estimated OpenAI cost for the last 14 days">
            {chartDays.map((item) => (
              <div key={item.key} className="group flex h-full min-w-0 flex-1 items-end" title={`${item.label}: ${money(item.cost, 4)}`}>
                <div className="w-full rounded-t bg-gradient-to-t from-glow to-glow-cyan group-hover:opacity-70" style={{ height: peakCost === 0 ? 0 : `${(item.cost / peakCost) * 100}%` }} />
              </div>
            ))}
          </div>
          <div className="mt-2 flex justify-between text-xs text-ink-muted"><span>{chartDays[0]?.label}</span><span>{chartDays[13]?.label}</span></div>
          {peakCost === 0 && <p className="mt-4 text-sm text-ink-muted">No estimated cost recorded in this period.</p>}
        </Card>
        <Card>
          <h3 className="text-lg font-semibold text-ink">Paid plan mix</h3>
          <p className="mt-1 text-sm text-ink-muted">Active subscribers by plan</p>
          <div className="mt-7 space-y-5">
            {planMix.map((plan) => (
              <div key={plan.name}>
                <div className="mb-2 flex justify-between gap-3 text-sm"><span className="font-medium text-ink">{plan.name}</span><span className="text-ink-muted">{plan.count}</span></div>
                <div className="h-2 overflow-hidden rounded-full bg-void"><div className="h-full rounded-full bg-glow-cyan" style={{ width: `${activeSubscriptionCount === 0 ? 0 : (plan.count / activeSubscriptionCount) * 100}%` }} /></div>
              </div>
            ))}
            {planMix.length === 0 && <p className="text-sm text-ink-muted">No active paid subscriptions yet.</p>}
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h3 className="text-lg font-semibold text-ink">Cost by model</h3>
          <p className="mt-1 text-sm text-ink-muted">Successful requests · trailing 30 days</p>
          <div className="mt-5 divide-y divide-line">
            {modelCosts.map((item) => (
              <div key={item.model} className="flex items-center justify-between gap-4 py-3 text-sm">
                <div><p className="font-mono text-ink">{item.model}</p><p className="mt-1 text-xs text-ink-muted">{item.count.toLocaleString('en-US')} requests</p></div>
                <span className="font-semibold text-ink">{money(Number(item.cost), 4)}</span>
              </div>
            ))}
            {modelCosts.length === 0 && <p className="py-3 text-sm text-ink-muted">No successful requests in this period.</p>}
          </div>
        </Card>
        <Card>
          <h3 className="text-lg font-semibold text-ink">Data quality & operations</h3>
          <p className="mt-1 text-sm text-ink-muted">Context for reading the estimates</p>
          <dl className="mt-5 divide-y divide-line text-sm">
            <div className="flex justify-between gap-4 py-3"><dt className="text-ink-muted">Cost coverage · 30 days</dt><dd className="font-semibold text-ink">{costCoverage === null ? '—' : `${costCoverage.toFixed(1)}%`}</dd></div>
            <div className="flex justify-between gap-4 py-3"><dt className="text-ink-muted">Requests missing cost</dt><dd className="font-semibold text-ink">{costRow?.requestsMissingCost ?? 0}</dd></div>
            <div className="flex justify-between gap-4 py-3"><dt className="text-ink-muted">Input / output tokens</dt><dd className="font-semibold text-ink">{Number(costRow?.inputTokens ?? 0).toLocaleString('en-US')} / {Number(costRow?.outputTokens ?? 0).toLocaleString('en-US')}</dd></div>
            <div className="flex justify-between gap-4 py-3"><dt className="text-ink-muted">Requests today</dt><dd className="font-semibold text-ink">{requestsToday.toLocaleString('en-US')}</dd></div>
            <div className="flex justify-between gap-4 py-3"><dt className="text-ink-muted">Error rate today</dt><dd className="font-semibold text-ink">{errorRate.toFixed(1)}%</dd></div>
            <div className="flex justify-between gap-4 py-3"><dt className="text-ink-muted">Guardrail failure rate</dt><dd className="font-semibold text-ink">{guardrailFailureRate.toFixed(1)}%</dd></div>
            <div className="flex justify-between gap-4 py-3"><dt className="text-ink-muted">Total users</dt><dd className="font-semibold text-ink">{totalUsers.toLocaleString('en-US')}</dd></div>
          </dl>
        </Card>
      </div>
      <p className="border-t border-line pt-4 text-xs leading-relaxed text-ink-muted">Listed monthly value is not collected revenue. OpenAI cost uses per-request estimates, not provider invoices. Organization and seat reporting follows the E0 migration.</p>
    </div>
  );
}
