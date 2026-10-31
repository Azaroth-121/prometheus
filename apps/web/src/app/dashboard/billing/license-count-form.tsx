'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Input } from '@prometheus/ui';

/** Changes how many licenses the active organization pays for (ADR-004). */
export function LicenseCountForm({ purchased, assigned, maximum }: { purchased: number; assigned: number; maximum: number }) {
  const router = useRouter();
  const [quantity, setQuantity] = useState(String(purchased));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch('/api/billing/licenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quantity: Number(quantity) }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? 'Could not update licenses.');
        return;
      }
      setMessage(
        data.pending_payment
          ? 'The new licenses will be added once the prorated invoice is paid.'
          : `You now have ${data.purchased} licenses.`
      );
      router.refresh();
    } catch {
      setError('Could not reach the billing service.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <div className="flex gap-2">
        <div className="w-28">
          <Input
            type="number"
            min={Math.max(assigned, 1)}
            max={maximum}
            step={1}
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
            aria-label="Number of licenses"
          />
        </div>
        <Button type="submit" variant="secondary" disabled={saving || Number(quantity) === purchased}>
          {saving ? 'Updating…' : 'Update licenses'}
        </Button>
      </div>
      <p className="text-xs text-ink-muted">
        Added licenses are charged now for the rest of this period. Removed licenses stop at once and are not refunded; your next bill uses the lower count.
      </p>
      {error && <p className="text-sm text-red-400">{error}</p>}
      {message && <p className="text-sm text-ink-muted">{message}</p>}
    </form>
  );
}
