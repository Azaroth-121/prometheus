'use client';

import { useActionState, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Button, Card, Glow, Input } from '@prometheus/ui';
import { registerAction, type RegisterState } from './actions';

const initialState: RegisterState = { error: null, success: false };
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
  // Rendered once per mount, embedded as a hidden field, and checked server-side
  // in registerAction -- a submission that arrives implausibly fast after the
  // form rendered is treated as a bot, not a user who read and filled it in.
  const [startedAt] = useState(() => Date.now());
  const [confirmPassword, setConfirmPassword] = useState('');
  const [clientError, setClientError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    const form = event.currentTarget;
    const email = String(new FormData(form).get('email') ?? '');
    const password = String(new FormData(form).get('password') ?? '');

    if (!EMAIL_PATTERN.test(email)) {
      event.preventDefault();
      setClientError('Enter a valid email address.');
      return;
    }
    if (password !== confirmPassword) {
      event.preventDefault();
      setClientError('Passwords do not match.');
      return;
    }
    setClientError(null);
  }

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
        <form className="flex flex-col gap-4" action={formAction} onSubmit={handleSubmit} noValidate>
          <Input type="email" name="email" placeholder="Email" required />
          <Input type="password" name="password" placeholder="Password" minLength={8} required />
          <Input
            type="password"
            placeholder="Confirm password"
            minLength={8}
            required
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />

          {/* Honeypot: invisible to sighted users and skipped by tab order; a
              real person never fills this in, a bot that autofills every
              field will. Checked server-side in registerAction. */}
          <input
            type="text"
            name="company"
            autoComplete="off"
            tabIndex={-1}
            aria-hidden="true"
            className="absolute h-0 w-0 opacity-0"
            style={{ position: 'absolute', left: '-9999px' }}
          />
          <input type="hidden" name="startedAt" value={startedAt} readOnly />

          <p aria-live="polite" className="min-h-[1.25rem] text-sm text-red-400">
            {clientError ?? state.error}
          </p>

          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Creating account…' : 'Create account'}
          </Button>
        </form>
      </Card>
      <p className="text-center text-xs text-ink-muted">
        By creating an account, you agree to our{' '}
        <Link href="/terms" className="underline hover:text-ink">Terms</Link>{' '}
        and{' '}
        <Link href="/privacy" className="underline hover:text-ink">Privacy Policy</Link>.
      </p>
    </main>
  );
}
