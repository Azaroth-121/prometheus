import { desc, eq } from 'drizzle-orm';
import { optimizationRequests } from '@prometheus/database';
import { Card } from '@prometheus/ui';
import { db } from '@/lib/db';

export default async function AdminRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;

  const requests = await db
    .select({
      id: optimizationRequests.id,
      userId: optimizationRequests.userId,
      source: optimizationRequests.source,
      mode: optimizationRequests.mode,
      status: optimizationRequests.status,
      errorCode: optimizationRequests.errorCode,
      outcome: optimizationRequests.outcome,
      latencyMs: optimizationRequests.latencyMs,
      createdAt: optimizationRequests.createdAt,
      completedAt: optimizationRequests.completedAt,
    })
    .from(optimizationRequests)
    .where(
      status === 'pending' || status === 'succeeded' || status === 'failed'
        ? eq(optimizationRequests.status, status)
        : undefined
    )
    .orderBy(desc(optimizationRequests.createdAt))
    .limit(50);

  return (
    <div className="flex flex-col gap-4">
      <form className="flex gap-2 text-sm">
        {['pending', 'succeeded', 'failed'].map((s) => (
          <a
            key={s}
            href={`/admin/requests?status=${s}`}
            className={`rounded border px-3 py-1 ${status === s ? 'border-glow text-glow-cyan' : 'border-line text-ink-muted'}`}
          >
            {s}
          </a>
        ))}
        <a
          href="/admin/requests"
          className={`rounded border px-3 py-1 ${!status ? 'border-glow text-glow-cyan' : 'border-line text-ink-muted'}`}
        >
          all
        </a>
      </form>
      <Card className="flex flex-col divide-y divide-line p-0">
        {requests.map((r) => (
          <div key={r.id} className="flex items-center justify-between gap-4 p-4 text-sm">
            <div>
              <p className="font-medium text-ink">
                {r.mode} · {r.source}
              </p>
              <p className="text-ink-muted">
                {r.createdAt.toLocaleString()}
                {r.latencyMs != null ? ` · ${r.latencyMs}ms` : ''}
              </p>
            </div>
            <div className="text-right">
              <p className={r.status === 'failed' ? 'font-medium text-red-400' : 'font-medium text-ink'}>
                {r.status}
              </p>
              {r.errorCode && <p className="text-ink-muted">{r.errorCode}</p>}
              {r.outcome && (
                <p className={r.outcome === 'rejected' ? 'text-red-400' : 'text-ink-muted'}>{r.outcome}</p>
              )}
            </div>
          </div>
        ))}
        {requests.length === 0 && <p className="p-4 text-sm text-ink-muted">No requests found.</p>}
      </Card>
    </div>
  );
}
