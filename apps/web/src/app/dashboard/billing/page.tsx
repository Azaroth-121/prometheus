'use client';

import { useState } from 'react';
import { Button, Card } from '@prometheus/ui';

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

export default function BillingPage() {
  const [loadingCode, setLoadingCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubscribe(planCode: string) {
    setLoadingCode(planCode);
    setError(null);
    try {
      const response = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planCode }),
      });
      const data = await response.json();
      if (!response.ok || !data.approve_url) {
        setError(data.error ?? 'Could not start checkout.');
        setLoadingCode(null);
        return;
      }
      window.location.href = data.approve_url;
    } catch {
      setError('Could not reach the billing service.');
      setLoadingCode(null);
    }
  }

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-16">
      <div>
        <h1 className="text-2xl font-semibold">Upgrade Prometheus</h1>
        <p className="text-gray-600">Pick a plan. Manage or cancel anytime from your PayPal account.</p>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <p className="text-center text-2xl font-bold text-brand-700">
        Donate to Kurt for being a goodboy 🐶
      </p>
      <div className="grid gap-4 sm:grid-cols-3">
        {PLAN_OPTIONS.map((plan) => (
          <Card key={plan.code} className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">{plan.name}</h2>
            <p className="text-3xl font-bold">
              ${plan.price}
              <span className="text-sm font-normal text-gray-500">/mo</span>
            </p>
            <p className="text-sm text-gray-600">
              {plan.requestLimit.toLocaleString()} optimizations/mo
            </p>
            <Button onClick={() => handleSubscribe(plan.code)} disabled={loadingCode !== null}>
              {loadingCode === plan.code ? 'Redirecting…' : `Subscribe to ${plan.name}`}
            </Button>
          </Card>
        ))}
      </div>
    </main>
  );
}
