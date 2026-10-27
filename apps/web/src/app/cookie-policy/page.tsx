import { DraftNotice } from '@/components/draft-notice';

export const metadata = {
  title: 'Cookie Policy',
};

export default function CookiePolicyPage() {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-24 text-sm leading-relaxed text-ink-muted">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Cookie Policy</h1>
        <p className="mt-1 text-ink-muted">Last updated: October 2026</p>
      </div>

      <DraftNotice />

      <p>
        Prometheus uses a minimal set of cookies — strictly the ones needed to keep you signed
        in. We don&apos;t use advertising or analytics cookies, and no cookie consent banner is
        shown because nothing non-essential is set.
      </p>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold text-ink">Cookies we set</h2>
        <ul className="list-disc pl-5 flex flex-col gap-1">
          <li>
            <strong>Session cookie</strong> (set by NextAuth) — keeps you signed in to the web
            dashboard. Strictly necessary; the site can&apos;t authenticate you without it.
          </li>
        </ul>
        <p>
          The browser extension does not use cookies at all — it stores its own session token
          locally via <code className="rounded bg-surface-raised px-1 py-0.5 font-mono text-ink">
            chrome.storage.local
          </code>, scoped to the extension only.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold text-ink">Third parties</h2>
        <p>
          We don&apos;t embed third-party advertising, tracking, or analytics scripts on this
          site. See our{' '}
          <a className="text-glow-cyan underline" href="/privacy">
            Privacy Policy
          </a>{' '}
          for the service providers we do use to operate the product (OpenAI, Stripe, Make.com).
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold text-ink">Contact</h2>
        <p>
          Questions about this policy? Email{' '}
          <a className="text-glow-cyan underline" href="mailto:iamkurtrainiersacay@gmail.com">
            iamkurtrainiersacay@gmail.com
          </a>
          .
        </p>
      </section>
    </main>
  );
}
