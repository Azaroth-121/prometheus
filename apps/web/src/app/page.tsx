import Link from 'next/link';
import { Button } from '@prometheus/ui';

export default function LandingPage() {
  return (
    <main className="mx-auto flex max-w-2xl flex-col items-center gap-6 px-6 py-24 text-center">
      <h1 className="text-4xl font-semibold tracking-tight">Prometheus</h1>
      <p className="text-lg text-gray-600">
        Turn a rough request into a structured, copy-ready prompt. Prometheus never executes your
        request — it only improves how you ask.
      </p>
      <div className="flex gap-3">
        <Link href="/register">
          <Button variant="primary">Get started</Button>
        </Link>
        <Link href="/login">
          <Button variant="secondary">Sign in</Button>
        </Link>
      </div>
    </main>
  );
}
