import Link from 'next/link';
import { Card } from '@prometheus/ui';

/**
 * No DB writes here -- Stripe's webhook
 * (apps/web/src/app/api/webhooks/stripe/route.ts) is the source of truth for
 * subscription state, typically delivered before or right around this
 * redirect. Unlike the PayPal flow this replaces, activation no longer
 * depends on the user's browser actually reaching this page.
 */
export default function BillingSuccessPage() {
  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-2">
        <h1 className="font-display text-xl font-semibold text-ink">Payment received</h1>
        <p className="text-ink-muted">Your plan updates within moments.</p>
        <Link href="/dashboard/billing" className="text-glow-cyan hover:underline">
          Back to billing
        </Link>
      </Card>
    </div>
  );
}
