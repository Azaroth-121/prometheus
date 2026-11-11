import { getUserActivitySummary } from '@prometheus/billing';
import { Card } from '@prometheus/ui';
import { db } from '@/lib/db';
import { requirePlatformAdmin } from '@/lib/admin';

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / (24 * 60 * 60 * 1000));
}

function StatusPill({ lastUsedAt }: { lastUsedAt: string | null }) {
  const days = daysSince(lastUsedAt);
  if (days === null) {
    return <span className="rounded-full bg-surface px-2 py-0.5 text-xs text-ink-muted">Never used</span>;
  }
  if (days <= 7) {
    return <span className="rounded-full bg-glow-dim px-2 py-0.5 text-xs text-glow-cyan">Active</span>;
  }
  return <span className="rounded-full bg-surface px-2 py-0.5 text-xs text-ink-muted">Dormant ({days}d)</span>;
}

export default async function AdminActivityPage() {
  await requirePlatformAdmin();
  const rows = await getUserActivitySummary(db);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="font-display text-xl font-semibold text-ink">User activity</h2>
        <p className="text-sm text-ink-muted">
          Every individual user: last used, and request frequency over 7/30 days. Not scoped to
          &quot;trial&quot; yet — that definition is still pending.
        </p>
      </div>
      <Card className="divide-y divide-line p-0">
        <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr] gap-2 p-4 text-xs font-medium text-ink-muted uppercase">
          <span>User</span>
          <span>Plan</span>
          <span>Signed up</span>
          <span>Last used</span>
          <span>7d / 30d</span>
          <span>Status</span>
        </div>
        {rows.map((row) => (
          <div
            key={row.userId}
            className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr] items-center gap-2 p-4 text-sm"
          >
            <div>
              <p className="font-medium text-ink">{row.displayName || row.email}</p>
              <p className="text-xs text-ink-muted">{row.email}</p>
            </div>
            <span className="text-ink-muted">{row.planCode}</span>
            <span className="text-ink-muted">{new Date(row.signedUpAt).toLocaleDateString()}</span>
            <span className="text-ink-muted">
              {row.lastUsedAt ? new Date(row.lastUsedAt).toLocaleDateString() : '—'}
            </span>
            <span className="text-ink-muted">
              {row.requestsLast7Days} / {row.requestsLast30Days}
            </span>
            <StatusPill lastUsedAt={row.lastUsedAt} />
          </div>
        ))}
        {rows.length === 0 && <p className="p-4 text-sm text-ink-muted">No users found.</p>}
      </Card>
    </div>
  );
}
