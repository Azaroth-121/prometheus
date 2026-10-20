import { desc, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { organizationMembers, organizations, profiles } from '@prometheus/database';
import { Card } from '@prometheus/ui';
import { requirePlatformAdmin } from '@/lib/admin';

export default async function AdminMembersPage() {
  await requirePlatformAdmin();
  const members = await db
    .select({
      id: organizationMembers.id,
      email: profiles.email,
      displayName: profiles.displayName,
      role: organizationMembers.role,
      organizationName: organizations.name,
      joinedAt: organizationMembers.createdAt,
      requests: sql<number>`(select count(*)::int from optimization_requests r where r.organization_id = ${organizationMembers.organizationId} and r.user_id = ${organizationMembers.userId} and r.created_at >= now() - interval '30 days')`,
    })
    .from(organizationMembers)
    .innerJoin(profiles, eq(profiles.id, organizationMembers.userId))
    .innerJoin(organizations, eq(organizations.id, organizationMembers.organizationId))
    .orderBy(desc(organizationMembers.createdAt))
    .limit(200);

  return (
    <div className="flex flex-col gap-4">
      <div><h2 className="font-display text-xl font-semibold text-ink">All organization members</h2><p className="text-sm text-ink-muted">Read-only membership and recent usage oversight.</p></div>
      <Card className="divide-y divide-line p-0">
        {members.map((member) => (
          <div key={member.id} className="flex flex-col justify-between gap-2 p-4 sm:flex-row sm:items-center">
            <div><p className="font-medium text-ink">{member.displayName || member.email}</p><p className="text-sm text-ink-muted">{member.email}</p></div>
            <p className="text-sm text-ink-muted">{member.organizationName} - {member.role}</p>
            <p className="text-sm text-ink-muted">{member.requests} requests / 30d</p>
          </div>
        ))}
        {members.length === 0 && <p className="p-4 text-sm text-ink-muted">No organization members found.</p>}
      </Card>
    </div>
  );
}
