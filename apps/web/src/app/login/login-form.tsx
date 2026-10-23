'use client';

import { useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { Button, Card, Input } from '@prometheus/ui';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedEmail = email.trim();
    if (!EMAIL_PATTERN.test(trimmedEmail)) {
      setError('Enter a valid email address.');
      return;
    }
    if (!password) {
      setError('Enter your password.');
      return;
    }

    setError(null);
    setIsSubmitting(true);

    const result = await signIn('credentials', { email: trimmedEmail, password, redirect: false });

    setIsSubmitting(false);

    if (!result || result.error) {
      setError('Invalid email or password.');
      return;
    }

    router.push(searchParams.get('redirectTo') ?? '/dashboard');
    router.refresh();
  }

  return (
    <Card>
      <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
        <Input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={error ? true : undefined}
          required
        />
        <Input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-invalid={error ? true : undefined}
          required
        />
        <p aria-live="polite" className="min-h-[1.25rem] text-sm text-red-400">
          {error}
        </p>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
    </Card>
  );
}
