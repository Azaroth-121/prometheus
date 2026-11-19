'use client';

import { useState } from 'react';
import { Button, Card, Input } from '@prometheus/ui';

interface PlanOption {
  code: string;
  name: string;
  price: number;
  requestLimit: number;
}

// Mirrors packages/billing/src/plans.ts — placeholder pricing (plan doc
// section 9: don't finalize until costs/fees/margin are modeled).
const PLAN_OPTIONS: PlanOption[] = [
  { code: 'pro', name: 'Pro', price: 20, requestLimit: 500 },
  { code: 'business', name: 'Business', price: 50, requestLimit: 1500 },
  { code: 'enterprise', name: 'Enterprise', price: 100, requestLimit: 5000 },
];

/**
 * `licenses` turns on organization checkout: prices are per license and the
 * buyer picks how many licenses to buy (ADR-004).
 */
export function PlanCards({
  disabled = false,
  licenses,
}: {
  disabled?: boolean;
  licenses?: { min: number; max: number };
}) {
  const [loadingCode, setLoadingCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(String(licenses?.min ?? 1));
  const licenseCount = Number(quantity);
  const totalFor = licenses && Number.isInteger(licenseCount) && licenseCount > 1 ? licenseCount : null;

  async function handlePay(planCode: string) {
    setLoadingCode(planCode);
    setError(null);
    try {
      const response = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(licenses ? { planCode, quantity: Number(quantity) } : { planCode }),
      });
      const data = await response.json();
      if (!response.ok || !data.checkout_url) {
        setError(data.error ?? 'Could not start checkout.');
        setLoadingCode(null);
        return;
      }
      window.location.href = data.checkout_url;
    } catch {
      setError('Could not reach the billing service.');
      setLoadingCode(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {error && <p className="text-sm text-red-400">{error}</p>}
      {licenses && (
        <label className="flex flex-wrap items-center gap-3 text-sm text-ink-muted">
          Licenses
          <span className="block w-28">
            <Input
              type="number"
              min={licenses.min}
              max={licenses.max}
              step={1}
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              disabled={disabled}
            />
          </span>
          <span>One license per person who uses Prometheus.</span>
        </label>
      )}
      <div className="grid gap-4 sm:grid-cols-3">
        {PLAN_OPTIONS.map((plan) => (
          <Card key={plan.code} className="flex flex-col gap-3 hover:border-glow/60 hover:shadow-glow-sm">
            <h2 className="font-display text-lg font-semibold text-ink">{plan.name}</h2>
            <p className="text-3xl font-bold text-ink">
              ${plan.price}
              <span className="text-sm font-normal text-ink-muted">{licenses ? ' / license / month' : ' / month'}</span>
            </p>
            <p className="text-sm text-ink-muted">
              {plan.requestLimit.toLocaleString()} optimizations / month{licenses ? ' per license' : ''}
            </p>
            {totalFor !== null && (
              <p className="text-sm text-ink">
                ${(plan.price * totalFor).toLocaleString()} / month for {totalFor} licenses
              </p>
            )}
            <Button onClick={() => handlePay(plan.code)} disabled={disabled || loadingCode !== null}>
              {loadingCode === plan.code ? 'Redirecting…' : `Subscribe to ${plan.name}`}
            </Button>
          </Card>
        ))}
      </div>
    </div>
  );
}
