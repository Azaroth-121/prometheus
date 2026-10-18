import { DraftNotice } from '@/components/draft-notice';

export const metadata = {
  title: 'Acceptable Use Policy',
};

export default function AcceptableUsePage() {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-24 text-sm leading-relaxed text-ink-muted">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Acceptable Use Policy</h1>
        <p className="mt-1 text-ink-muted">Last updated: October 2026</p>
      </div>

      <DraftNotice />

      <p>
        Prometheus only rewrites prompts — it never executes them. That said, you agree not to
        use the service to produce prompts intended for the following:
      </p>

      <section className="flex flex-col gap-2">
        <ul className="list-disc pl-5 flex flex-col gap-1">
          <li>Harassment, threats, or content targeting a specific person or group.</li>
          <li>Generating malware, exploit code, or instructions for causing physical harm.</li>
          <li>Fraud, impersonation, or deceptive/misleading content distributed as genuine.</li>
          <li>Circumventing the safety or usage policies of the AI service you&apos;ll paste the prompt into.</li>
          <li>Automated abuse of Prometheus itself — scraping, credential stuffing, or excessive request volume outside your plan&apos;s limits.</li>
        </ul>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold text-ink">Enforcement</h2>
        <p>
          We may suspend or terminate accounts that violate this policy. See our{' '}
          <a className="text-glow-cyan underline" href="/terms">
            Terms &amp; Conditions
          </a>{' '}
          for the broader agreement this policy sits under.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold text-ink">Contact</h2>
        <p>
          To report abuse, email{' '}
          <a className="text-glow-cyan underline" href="mailto:iamkurtrainiersacay@gmail.com">
            iamkurtrainiersacay@gmail.com
          </a>
          .
        </p>
      </section>
    </main>
  );
}
