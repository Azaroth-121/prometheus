'use client';

import { useActionState } from 'react';
import { Button, Card, Glow, Input } from '@prometheus/ui';
import { registerAction, type RegisterState } from './actions';

const initialState: RegisterState = { error: null, success: false };

function Wordmark() {
  return (
    <div className="mx-auto flex items-center gap-2">
      <Glow className="h-2 w-2" />
      <span className="font-display text-xs font-semibold tracking-widest text-ink-muted uppercase">
        Prometheus
      </span>
    </div>
  );
}

export default function RegisterPage() {
  const [state, formAction, isSubmitting] = useActionState(registerAction, initialState);

  if (state.success) {
    return (
      <main className="mx-auto flex max-w-sm flex-col gap-4 px-6 py-24 text-center">
        <Wordmark />
        <h1 className="font-display text-2xl font-semibold text-ink">Check your email</h1>
        <p className="text-ink-muted">
          We&apos;ve sent a confirmation link to your inbox. Confirm your address, then sign in.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-sm flex-col gap-6 px-6 py-24">
      <Wordmark />
      <h1 className="font-display text-center text-2xl font-semibold text-ink">
        Create an account
      </h1>
      <Card>
        <form className="flex flex-col gap-4" action={formAction}>
          <Input type="email" name="email" placeholder="Email" required />
          <Input type="password" name="password" placeholder="Password" minLength={8} required />
          {state.error && <p className="text-sm text-red-400">{state.error}</p>}
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Creating account…' : 'Create account'}
          </Button>
        </form>
      </Card>
    </main>
  );
}
