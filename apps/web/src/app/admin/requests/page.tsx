import { Card } from '@prometheus/ui';
import { createClient } from '@/lib/supabase/server';

export default async function AdminRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const supabase = await createClient();

  let query = supabase
    .from('optimization_requests')
    .select('id, user_id, source, mode, status, error_code, latency_ms, created_at, completed_at')
    .order('created_at', { ascending: false })
    .limit(50);
  if (status) {
    query = query.eq('status', status);
  }
  const { data: requests } = await query;

  return (
    <div className="flex flex-col gap-4">
      <form className="flex gap-2 text-sm">
        {['pending', 'succeeded', 'failed'].map((s) => (
          <a
            key={s}
            href={`/admin/requests?status=${s}`}
            className={`rounded border px-3 py-1 ${status === s ? 'border-brand-600 text-brand-700' : 'border-gray-300 text-gray-600'}`}
          >
            {s}
          </a>
        ))}
        <a
          href="/admin/requests"
          className={`rounded border px-3 py-1 ${!status ? 'border-brand-600 text-brand-700' : 'border-gray-300 text-gray-600'}`}
        >
          all
        </a>
      </form>
      <Card className="flex flex-col divide-y p-0">
        {(requests ?? []).map((r) => (
          <div key={r.id} className="flex items-center justify-between gap-4 p-4 text-sm">
            <div>
              <p className="font-medium">
                {r.mode} · {r.source}
              </p>
              <p className="text-gray-600">
                {new Date(r.created_at).toLocaleString()}
                {r.latency_ms != null ? ` · ${r.latency_ms}ms` : ''}
              </p>
            </div>
            <div className="text-right">
              <p className={r.status === 'failed' ? 'font-medium text-red-600' : 'font-medium'}>
                {r.status}
              </p>
              {r.error_code && <p className="text-gray-600">{r.error_code}</p>}
            </div>
          </div>
        ))}
        {(requests ?? []).length === 0 && (
          <p className="p-4 text-sm text-gray-600">No requests found.</p>
        )}
      </Card>
    </div>
  );
}
