import Link from 'next/link';
import { desc, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { organizations, organizationSubscriptions, plans } from '@prometheus/database';
import { Card } from '@prometheus/ui';
import { requirePlatformAdmin } from '@/lib/admin';

export default async function AdminOrganizationsPage() {
  await requirePlatformAdmin();
  const rows = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      slug: organizations.slug,
      status: organizations.status,
      createdAt: organizations.createdAt,
      members: sql<number>`(select count(*)::int from organization_members om where om.organization_id = ${organizations.id})`,
      requests: sql<number>`(select count(*)::int from optimization_requests r where r.organization_id = ${organizations.id} and r.created_at >= now() - interval '30 days')`,
      planName: plans.name,
      subscriptionStatus: organizationSubscriptions.status,
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
      <div><h2 className="font-display text-xl font-semibold text-ink">All organizations</h2><p className="text-sm text-ink-muted">Read-only platform oversight of membership, plans, and usage.</p></div>
      <Card className="divide-y divide-line p-0">
        {rows.map((organization) => (
          <Link key={organization.id} href={`/admin/organizations/${organization.id}`} className="grid gap-2 p-4 hover:bg-white/[0.02] sm:grid-cols-[1fr_auto_auto_auto] sm:items-center">
            <div><p className="font-medium text-ink">{organization.name}</p><p className="text-sm text-ink-muted">{organization.slug} - {organization.status}</p></div>
            <p className="text-sm text-ink-muted">{organization.members} members</p>
            <p className="text-sm text-ink-muted">{organization.requests} requests / 30d</p>
            <p className="text-sm text-ink">{organization.planName ?? 'Free'}{organization.subscriptionStatus ? ` - ${organization.subscriptionStatus}` : ''}</p>
          </Link>
        ))}
        {rows.length === 0 && <p className="p-4 text-sm text-ink-muted">No organizations found.</p>}
      </Card>
    </div>
  );
}
