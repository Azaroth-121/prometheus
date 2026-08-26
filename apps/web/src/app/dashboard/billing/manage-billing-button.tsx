'use client';

import { useState } from 'react';
import { Button } from '@prometheus/ui';

/** Redirects to Stripe's hosted Customer Portal -- cancel, payment method updates, and plan switching (if enabled), no custom UI. */
export function ManageBillingButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/billing/portal', { method: 'POST' });
      const data = await response.json();
      if (!response.ok || !data.portal_url) {
        setError(data.error ?? 'Could not open billing management.');
        setLoading(false);
        return;
      }
      window.location.href = data.portal_url;
    } catch {
      setError('Could not reach the billing service.');
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {error && <p className="text-sm text-red-400">{error}</p>}
      <Button variant="secondary" onClick={handleClick} disabled={loading} className="self-start">
        {loading ? 'Opening…' : 'Manage billing'}
      </Button>
    </div>
  );
}
