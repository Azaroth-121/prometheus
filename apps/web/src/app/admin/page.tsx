import { Card } from '@prometheus/ui';
import { createClient } from '@/lib/supabase/server';

function startOfTodayIso(): string {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  return start.toISOString();
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <p className="text-sm text-gray-600">{label}</p>
      <p className="text-2xl font-semibold">{value}</p>
    </Card>
  );
}

export default async function AdminOverviewPage() {
  const supabase = await createClient();

  const { count: totalUsers } = await supabase
    .from('profiles')
    .select('*', { count: 'exact', head: true });

  const { data: todaysRequests } = await supabase
    .from('optimization_requests')
    .select('status, error_code')
    .gte('created_at', startOfTodayIso());

  const requestsToday = todaysRequests?.length ?? 0;
  const failedToday = todaysRequests?.filter((r) => r.status === 'failed').length ?? 0;
  const guardrailFailedToday =
    todaysRequests?.filter((r) => r.error_code === 'GUARDRAIL_VALIDATION_FAILED').length ?? 0;

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
