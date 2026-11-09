import { notFound } from 'next/navigation';
import { and, eq, gte, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { organizationMembers, organizations, optimizationRequests, profiles } from '@prometheus/database';
import { Card } from '@prometheus/ui';
import { requirePlatformAdmin } from '@/lib/admin';

export default async function AdminOrganizationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePlatformAdmin();
  const { id } = await params;
  const [organization] = await db.select().from(organizations).where(eq(organizations.id, id)).limit(1);
  if (!organization) notFound();
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const members = await db
    .select({
      id: organizationMembers.id,
      email: profiles.email,
      displayName: profiles.displayName,
      role: organizationMembers.role,
      joinedAt: organizationMembers.createdAt,
      requests: sql<number>`count(${optimizationRequests.id})::int`,
      tokens: sql<number>`coalesce(sum(coalesce(${optimizationRequests.inputTokens}, 0) + coalesce(${optimizationRequests.outputTokens}, 0)), 0)::int`,
    })
    .from(organizationMembers)
    .innerJoin(profiles, eq(profiles.id, organizationMembers.userId))
    .leftJoin(
      optimizationRequests,
      and(
        eq(optimizationRequests.userId, profiles.id),
        eq(optimizationRequests.organizationId, id),
        gte(optimizationRequests.createdAt, since)
      )
    )
    .where(eq(organizationMembers.organizationId, id))
    .groupBy(organizationMembers.id, profiles.id, profiles.email, profiles.displayName)
    .orderBy(organizationMembers.createdAt);

  return (
    <div className="flex flex-col gap-4">
      <div><p className="text-xs uppercase tracking-[0.2em] text-glow-cyan">Organization</p><h2 className="font-display text-xl font-semibold text-ink">{organization.name}</h2><p className="text-sm text-ink-muted">{organization.slug} - {organization.status}</p></div>
      <Card className="divide-y divide-line p-0">
        {members.map((member) => (
          <div key={member.id} className="flex items-center justify-between gap-4 p-4">
            <div><p className="font-medium text-ink">{member.displayName || member.email}</p><p className="text-sm text-ink-muted">{member.email} - {member.role}</p></div>
            <p className="text-right text-sm text-ink-muted">{member.requests} requests<br />{member.tokens.toLocaleString()} tokens / 30d</p>
          </div>
        ))}
      </Card>
    </div>
  );
}
