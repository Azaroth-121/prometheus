import Link from 'next/link';
import { Button, Glow } from '@prometheus/ui';

export default function NotFound() {
  return (
    <main className="mx-auto flex max-w-sm flex-col items-center gap-6 px-6 py-24 text-center">
      <div className="flex items-center gap-2">
        <Glow className="h-2 w-2" />
        <span className="font-display text-xs font-semibold tracking-widest text-ink-muted uppercase">
          Prometheus
        </span>
      </div>
      <h1 className="font-display text-4xl font-bold text-ink">404</h1>
      <p className="text-ink-muted">
        This page doesn&apos;t exist, or it moved. Check the link, or head back to safety.
      </p>
      <Link href="/">
        <Button variant="primary">Back home</Button>
      </Link>
    </main>
  );
}
