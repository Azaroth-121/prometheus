import { desc, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { organizationSubscriptions, organizations, plans } from '@prometheus/database';
import { Card } from '@prometheus/ui';
import { requirePlatformAdmin } from '@/lib/admin';

export default async function AdminUsagePage() {
  await requirePlatformAdmin();
  const rows = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      planName: plans.name,
      subscriptionStatus: organizationSubscriptions.status,
      periodEnd: organizationSubscriptions.currentPeriodEnd,
      requests: sql<number>`(select count(*)::int from optimization_requests r where r.organization_id = ${organizations.id} and r.created_at >= now() - interval '30 days')`,
      tokens: sql<number>`(select coalesce(sum(coalesce(r.input_tokens, 0) + coalesce(r.output_tokens, 0)), 0)::int from optimization_requests r where r.organization_id = ${organizations.id} and r.created_at >= now() - interval '30 days')`,
      estimatedCost: sql<string>`(select coalesce(sum(r.estimated_cost), 0)::text from optimization_requests r where r.organization_id = ${organizations.id} and r.created_at >= now() - interval '30 days')`,
    })
    .from(organizations)
    .leftJoin(
      organizationSubscriptions,
      sql`${organizationSubscriptions.id} = (select os.id from organization_subscriptions os where os.organization_id = ${organizations.id} order by os.current_period_end desc limit 1)`
    )
    .leftJoin(plans, eq(plans.id, organizationSubscriptions.planId))
    .orderBy(desc(organizations.createdAt));

  return (
    <div className="flex flex-col gap-4">
      <div><h2 className="font-display text-xl font-semibold text-ink">Organization usage & billing</h2><p className="text-sm text-ink-muted">Shared consumption and current Stripe-backed plan state.</p></div>
      <Card className="divide-y divide-line p-0">
        {rows.map((row) => (
          <div key={row.id} className="grid gap-2 p-4 sm:grid-cols-[1fr_auto_auto_auto] sm:items-center">
            <div><p className="font-medium text-ink">{row.name}</p><p className="text-sm text-ink-muted">{row.planName ?? 'Free'}{row.subscriptionStatus ? ` - ${row.subscriptionStatus}` : ''}</p></div>
            <p className="text-sm text-ink-muted">{row.requests.toLocaleString()} requests</p>
            <p className="text-sm text-ink-muted">{row.tokens.toLocaleString()} tokens</p>
            <p className="text-sm text-ink">${Number(row.estimatedCost).toFixed(4)} estimated</p>
          </div>
        ))}
        {rows.length === 0 && <p className="p-4 text-sm text-ink-muted">No organization usage found.</p>}
      </Card>
    </div>
  );
}
