import { desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { adminAuditLogs, organizations, profiles } from '@prometheus/database';
import { Card } from '@prometheus/ui';
import { requirePlatformAdmin } from '@/lib/admin';

export default async function AdminAuditPage() {
  await requirePlatformAdmin();
  const events = await db
    .select({
      id: adminAuditLogs.id,
      action: adminAuditLogs.action,
      targetType: adminAuditLogs.targetType,
      targetId: adminAuditLogs.targetId,
      reason: adminAuditLogs.reason,
      actorEmail: profiles.email,
      organizationName: organizations.name,
      createdAt: adminAuditLogs.createdAt,
    })
    .from(adminAuditLogs)
    .innerJoin(profiles, eq(profiles.id, adminAuditLogs.adminUserId))
    .leftJoin(organizations, eq(organizations.id, adminAuditLogs.organizationId))
    .orderBy(desc(adminAuditLogs.createdAt))
    .limit(100);

  return (
    <div className="flex flex-col gap-4">
      <div><h2 className="font-display text-xl font-semibold text-ink">Audit events</h2><p className="text-sm text-ink-muted">Platform and organization administration events.</p></div>
      <Card className="divide-y divide-line p-0">
        {events.map((event) => (
          <div key={event.id} className="flex flex-col justify-between gap-2 p-4 sm:flex-row">
            <div><p className="font-medium text-ink">{event.action.replaceAll('_', ' ')}</p><p className="text-sm text-ink-muted">{event.actorEmail} - {event.organizationName ?? 'Platform'} - {event.targetType}</p>{event.reason && <p className="text-sm text-ink-muted">Reason: {event.reason}</p>}</div>
            <time className="shrink-0 text-sm text-ink-muted">{event.createdAt.toLocaleString()}</time>
          </div>
        ))}
        {events.length === 0 && <p className="p-4 text-sm text-ink-muted">No audit events found.</p>}
      </Card>
    </div>
  );
}
