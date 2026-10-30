import { and, eq, gte, sql } from 'drizzle-orm';
import { organizationSubscriptions, optimizationRequests, plans, subscriptions } from '@prometheus/database';
import { Card } from '@prometheus/ui';
import { db } from '@/lib/db';
import { requirePlatformAdmin } from '@/lib/admin';

const DAYS = 30;
const money = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
const count = (value: number) => new Intl.NumberFormat('en-US').format(value);

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <Card><p className="text-sm text-ink-muted">{label}</p><p className="mt-2 text-2xl font-semibold text-ink">{value}</p><p className="mt-1 text-xs text-ink-muted">{detail}</p></Card>;
}

export default async function AdminOverviewPage() {
  await requirePlatformAdmin();
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - DAYS);
  since.setUTCHours(0, 0, 0, 0);

  const [orgRows, userRows, dailyRows, modelRows] = await Promise.all([
    db.select({
      id: organizationSubscriptions.providerSubscriptionId,
      status: organizationSubscriptions.status,
      createdAt: organizationSubscriptions.createdAt,
      plan: plans.name,
      price: plans.monthlyPrice,
      currency: plans.currency,
    }).from(organizationSubscriptions).innerJoin(plans, eq(organizationSubscriptions.planId, plans.id)),
    db.select({
      id: subscriptions.providerSubscriptionId,
      status: subscriptions.status,
      createdAt: subscriptions.createdAt,
      plan: plans.name,
      price: plans.monthlyPrice,
      currency: plans.currency,
    }).from(subscriptions).innerJoin(plans, eq(subscriptions.planId, plans.id)),
    db.select({
      day: sql<string>`to_char(date_trunc('day', ${optimizationRequests.createdAt} AT TIME ZONE 'UTC'), 'YYYY-MM-DD')`,
      requests: sql<number>`count(*)::int`,
      cost: sql<string>`coalesce(sum(${optimizationRequests.estimatedCost}), 0)`,
      inputTokens: sql<number>`coalesce(sum(${optimizationRequests.inputTokens}), 0)::int`,
      outputTokens: sql<number>`coalesce(sum(${optimizationRequests.outputTokens}), 0)::int`,
    }).from(optimizationRequests)
      .where(and(gte(optimizationRequests.createdAt, since), eq(optimizationRequests.status, 'succeeded')))
      .groupBy(sql`date_trunc('day', ${optimizationRequests.createdAt} AT TIME ZONE 'UTC')`)
      .orderBy(sql`date_trunc('day', ${optimizationRequests.createdAt} AT TIME ZONE 'UTC') desc`),
    db.select({
      model: optimizationRequests.model,
      requests: sql<number>`count(*)::int`,
      cost: sql<string>`coalesce(sum(${optimizationRequests.estimatedCost}), 0)`,
    }).from(optimizationRequests)
      .where(and(gte(optimizationRequests.createdAt, since), eq(optimizationRequests.status, 'succeeded')))
      .groupBy(optimizationRequests.model)
      .orderBy(sql`sum(${optimizationRequests.estimatedCost}) desc`),
  ]);

  // E0 can leave the same provider subscription in both tables. Count it once.
  const orgIds = new Set(orgRows.map((row) => row.id));
  const all = [
    ...orgRows.map((row) => ({ ...row, scope: 'Organization' })),
    ...userRows.filter((row) => !orgIds.has(row.id)).map((row) => ({ ...row, scope: 'Individual' })),
  ];
  const active = all.filter((row) => row.status === 'active');
  const monthlyValue = active.filter((row) => row.currency.toLowerCase() === 'usd').reduce((sum, row) => sum + Number(row.price), 0);
  const mix = new Map<string, number>();
  for (const row of active) {
    const key = `${row.scope} · ${row.plan}`;
    mix.set(key, (mix.get(key) ?? 0) + 1);
  }
  const requests = dailyRows.reduce((sum, row) => sum + row.requests, 0);
  const cost = dailyRows.reduce((sum, row) => sum + Number(row.cost), 0);
  const inputTokens = dailyRows.reduce((sum, row) => sum + row.inputTokens, 0);
  const outputTokens = dailyRows.reduce((sum, row) => sum + row.outputTokens, 0);

  return <div className="space-y-8">
    <header><h1 className="text-2xl font-semibold text-ink">Billing and usage</h1><p className="mt-1 text-sm text-ink-muted">Platform overview · last {DAYS} days from {since.toISOString().slice(0, 10)} UTC</p></header>
    <section className="space-y-3" aria-labelledby="subscriptions-heading">
      <div><h2 id="subscriptions-heading" className="text-lg font-semibold text-ink">Subscriptions</h2><p className="text-sm text-ink-muted">Current database snapshot. Listed monthly value uses plan prices; it is not collected revenue.</p></div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Active subscriptions" value={count(active.length)} detail="Provider IDs counted once across both scopes" />
        <Metric label="Listed monthly value" value={money(monthlyValue)} detail="USD active prices; excludes discounts, tax and refunds" />
        <Metric label="New subscriptions" value={count(all.filter((row) => row.createdAt >= since).length)} detail={`Created in the last ${DAYS} days`} />
        <Metric label="Canceled subscriptions" value={count(all.filter((row) => row.status === 'canceled').length)} detail="Current status; cancellation date is not stored" />
      </div>
      <Card><h3 className="font-medium text-ink">Active subscriptions by plan</h3>
        {mix.size === 0 ? <p className="mt-3 text-sm text-ink-muted">No active subscriptions.</p> :
          <ul className="mt-3 divide-y divide-ink/10">{[...mix.entries()].sort((a, b) => b[1] - a[1]).map(([plan, total]) =>
            <li key={plan} className="flex justify-between py-2 text-sm"><span>{plan}</span><span className="font-medium">{count(total)}</span></li>)}</ul>}
      </Card>
    </section>
    <section className="space-y-3" aria-labelledby="usage-heading">
      <div><h2 id="usage-heading" className="text-lg font-semibold text-ink">OpenAI usage</h2><p className="text-sm text-ink-muted">Successful optimization requests only · estimated cost from the request ledger.</p></div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Estimated OpenAI cost" value={money(cost)} detail="Not an invoice amount" />
        <Metric label="Successful requests" value={count(requests)} detail={`Last ${DAYS} days`} />
        <Metric label="Input tokens" value={count(inputTokens)} detail={`Last ${DAYS} days`} />
        <Metric label="Output tokens" value={count(outputTokens)} detail={`Last ${DAYS} days`} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card><h3 className="font-medium text-ink">Daily trend (UTC)</h3>{dailyRows.length === 0 ? <p className="mt-3 text-sm text-ink-muted">No successful requests in this period.</p> :
          <div className="mt-3 max-h-80 overflow-auto"><table className="w-full text-sm"><thead><tr className="text-left text-ink-muted"><th className="pb-2">Day</th><th className="pb-2 text-right">Requests</th><th className="pb-2 text-right">Est. cost</th></tr></thead><tbody>{dailyRows.map((row) =>
            <tr key={row.day} className="border-t border-ink/10"><td className="py-2">{row.day}</td><td className="text-right">{count(row.requests)}</td><td className="text-right">{money(Number(row.cost))}</td></tr>)}</tbody></table></div>}</Card>
        <Card><h3 className="font-medium text-ink">By model</h3>{modelRows.length === 0 ? <p className="mt-3 text-sm text-ink-muted">No successful requests in this period.</p> :
          <div className="mt-3 overflow-auto"><table className="w-full text-sm"><thead><tr className="text-left text-ink-muted"><th className="pb-2">Model</th><th className="pb-2 text-right">Requests</th><th className="pb-2 text-right">Est. cost</th></tr></thead><tbody>{modelRows.map((row) =>
            <tr key={row.model} className="border-t border-ink/10"><td className="py-2">{row.model}</td><td className="text-right">{count(row.requests)}</td><td className="text-right">{money(Number(row.cost))}</td></tr>)}</tbody></table></div>}</Card>
      </div>
    </section>
  </div>;
}
