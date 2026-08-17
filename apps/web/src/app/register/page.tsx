'use client';

import { useActionState } from 'react';
import { Button, Card, Input } from '@prometheus/ui';
import { registerAction, type RegisterState } from './actions';

const initialState: RegisterState = { error: null, success: false };

export default function RegisterPage() {
  const [state, formAction, isSubmitting] = useActionState(registerAction, initialState);

  if (state.success) {
    return (
      <main className="mx-auto flex max-w-sm flex-col gap-4 px-6 py-24 text-center">
        <h1 className="text-2xl font-semibold">Check your email</h1>
        <p className="text-gray-600">
          We&apos;ve sent a confirmation link to your inbox. Confirm your address, then sign in.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-sm flex-col gap-6 px-6 py-24">
      <h1 className="text-2xl font-semibold">Create an account</h1>
      <Card>
        <form className="flex flex-col gap-4" action={formAction}>
          <Input type="email" name="email" placeholder="Email" required />
          <Input type="password" name="password" placeholder="Password" minLength={8} required />
          {state.error && <p className="text-sm text-red-600">{state.error}</p>}
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Creating account…' : 'Create account'}
          </Button>
        </form>
      </Card>
    </main>
  );
}
