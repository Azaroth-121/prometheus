import { getUsageSummary } from '@prometheus/billing';
import { Card } from '@prometheus/ui';
import { db } from '@/lib/db';

function ProgressBar({ used, limit }: { used: number; limit: number }) {
  const pct = limit > 0 ? Math.min((used / limit) * 100, 100) : 0;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
      <div className="h-full rounded-full bg-brand-600" style={{ width: `${pct}%` }} />
    </div>
  );
}

export async function UsageCard({ userId }: { userId: string }) {
  const usage = await getUsageSummary(db, userId);

  return (
    <Card className="flex flex-col gap-3">
      <p className="text-gray-600">Usage this period</p>
      <div className="flex flex-col gap-1">
        <div className="flex justify-between text-sm">
          <span>Requests</span>
          <span className="text-gray-600">
            {usage.requests_used.toLocaleString()} / {usage.requests_limit.toLocaleString()}
          </span>
        </div>
        <ProgressBar used={usage.requests_used} limit={usage.requests_limit} />
      </div>
      <div className="flex flex-col gap-1">
        <div className="flex justify-between text-sm">
          <span>Tokens</span>
          <span className="text-gray-600">
            {usage.tokens_used.toLocaleString()} / {usage.tokens_limit.toLocaleString()}
          </span>
        </div>
        <ProgressBar used={usage.tokens_used} limit={usage.tokens_limit} />
      </div>
    </Card>
  );
}
