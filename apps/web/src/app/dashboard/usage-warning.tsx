import Link from 'next/link';
import { usageThresholdReached } from '@prometheus/billing';
import type { UsageSummary } from '@prometheus/shared-types';
import { Card } from '@prometheus/ui';

/** Shown at the same 80% / 100% thresholds that email an organization's owner and billing managers (C.5). */
export function UsageWarning({ usage }: { usage: UsageSummary }) {
  const threshold = usageThresholdReached(
    { requests: usage.requests_used, tokens: usage.tokens_used },
    { requests: usage.requests_limit, tokens: usage.tokens_limit }
  );
  if (!threshold) return null;

  const isOrganization = usage.billing_scope === 'organization';
  const allowance = isOrganization ? `${usage.organization_name ?? 'Your organization'}'s shared allowance` : 'Your allowance';
  const status =
    threshold === 100 ? `${allowance} is used up, so optimizations are paused.` : `${allowance} is over 80% used.`;
  const reset = usage.expires_at
    ? `It resets on ${new Date(usage.expires_at).toLocaleDateString()}.`
    : 'The Free plan counts the last 30 days.';

  return (
    <Card role="status" className={`text-sm ${threshold === 100 ? 'text-red-400' : 'text-amber-400'}`}>
      {status} {reset}{' '}
      {isOrganization ? 'Owners and billing managers can add licenses or upgrade on ' : 'Upgrade on '}
      <Link href="/dashboard/billing" className="text-glow-cyan hover:underline">
        Billing
      </Link>
      .
    </Card>
  );
}
