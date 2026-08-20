import { sql, gte } from 'drizzle-orm';
import { profiles, optimizationRequests } from '@prometheus/database';
import { Card } from '@prometheus/ui';
import { db } from '@/lib/db';

function startOfToday(): Date {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
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

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      <StatCard label="Total users" value={String(totalUsers ?? 0)} />
      <StatCard label="Requests today" value={String(requestsToday)} />
      <StatCard label="Error rate today" value={`${errorRate.toFixed(1)}%`} />
      <StatCard label="Guardrail failure rate today" value={`${guardrailFailureRate.toFixed(1)}%`} />
    </div>
  );
}
