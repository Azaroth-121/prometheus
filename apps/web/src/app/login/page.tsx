import { Suspense } from 'react';
import { Glow } from '@prometheus/ui';
import { LoginForm } from './login-form';

export default function LoginPage() {
  return (
    <main className="mx-auto flex max-w-sm flex-col gap-6 px-6 py-24">
      <div className="mx-auto flex items-center gap-2">
        <Glow className="h-2 w-2" />
        <span className="font-display text-xs font-semibold tracking-widest text-ink-muted uppercase">
          Prometheus
        </span>
      </div>
      <h1 className="font-display text-center text-2xl font-semibold text-ink">Sign in</h1>
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
