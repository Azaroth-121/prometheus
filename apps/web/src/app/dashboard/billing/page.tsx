'use client';

import { useState } from 'react';
import { Button, Card } from '@prometheus/ui';

/**
 * The minimum clickable trigger needed to test a real PayPal approval flow —
 * not the polished pricing page (that's deferred; see documentation/architecture/implementation-notes.md).
 */
export default function BillingPage() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubscribe() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planCode: 'pro' }),
      });
      const data = await response.json();
      if (!response.ok || !data.approve_url) {
        setError(data.error ?? 'Could not start checkout.');
        setBusy(false);
        return;
      }
      window.location.href = data.approve_url;
    } catch {
      setError('Could not reach the billing service.');
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 px-6 py-16">
      <h1 className="text-2xl font-semibold">Billing</h1>
      <Card className="flex flex-col gap-3">
        <p className="text-gray-600">Subscribe to Prometheus Pro.</p>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Button onClick={handleSubscribe} disabled={busy}>
          {busy ? 'Redirecting…' : 'Subscribe'}
        </Button>
      </Card>
    </main>
  );
}
