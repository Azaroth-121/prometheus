import Link from 'next/link';
import { Button, Card, Glow } from '@prometheus/ui';

const BEFORE = 'write me a blog post about our new product';
const AFTER = `Write a 600-word blog post announcing [Product Name] to existing customers.

Audience: current users who already know our brand, evaluating whether to try
the new feature.
Tone: confident, plain-spoken -- no marketing fluff.
Structure: a hook, three concrete benefits, one short example, a clear CTA.
Constraints: no unverified claims, no superlatives ("revolutionary",
"game-changing"), plain paragraphs (no headers).`;

export default function LandingPage() {
  return (
    <main className="mx-auto flex max-w-3xl flex-col items-center gap-16 px-6 py-24">
      <div className="flex flex-col items-center gap-6 text-center">
        <div className="flex items-center gap-2">
          <Glow className="h-2.5 w-2.5" />
          <span
            className="font-display text-sm font-semibold tracking-widest text-ink-muted uppercase"
          >
            Prometheus
          </span>
        </div>

        <h1 className="font-display text-5xl font-bold text-ink">
          Ask better, get better.
        </h1>

        <p className="max-w-xl text-lg text-ink-muted">
          Turn a rough request into a structured, copy-ready prompt. Prometheus never executes
          your request — it only improves how you ask.
        </p>

        <div className="flex gap-3">
          <Link href="/register">
            <Button variant="primary">Get started</Button>
          </Link>
          <Link href="/login">
            <Button variant="secondary">Sign in</Button>
          </Link>
        </div>
      </div>

      <Card className="w-full text-left">
        <p className="mb-2 text-xs font-medium tracking-wide text-ink-muted uppercase">
          Before
        </p>
        <p className="mb-6 rounded border border-line bg-surface p-3 font-mono text-sm text-ink-muted">
          {BEFORE}
        </p>
        <p className="mb-2 text-xs font-medium tracking-wide text-glow-cyan uppercase">After</p>
        <pre className="whitespace-pre-wrap rounded border border-glow-dim bg-surface p-3 font-mono text-sm text-ink shadow-glow-sm">
{AFTER}
        </pre>
      </Card>
    </main>
  );
}
