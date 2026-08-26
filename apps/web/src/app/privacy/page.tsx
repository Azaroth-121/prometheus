export const metadata = {
  title: 'Privacy Policy — Prometheus',
};

export default function PrivacyPage() {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-24 text-sm leading-relaxed text-ink-muted">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Privacy Policy</h1>
        <p className="mt-1 text-ink-muted">Last updated: August 2026</p>
      </div>

      <p>
        Prometheus (&quot;Prometheus&quot;, &quot;we&quot;, &quot;us&quot;) is a browser extension and web
        application that helps you turn a rough request into a structured, copy-ready prompt for
        third-party AI assistants. This page explains what data we collect, why, and how it&apos;s
        used.
      </p>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold text-ink">Information we collect</h2>
        <ul className="list-disc pl-5 flex flex-col gap-1">
          <li>
            <strong>Account information:</strong> the email address and password you provide when
            you register. Passwords are stored as salted hashes — we never store or can recover
            your plaintext password.
          </li>
          <li>
            <strong>Prompt content:</strong> the text you submit for optimization is sent to
            OpenAI&apos;s API to generate a structured version of your request. We store the
            request metadata needed to enforce your plan&apos;s usage limits (timestamps, token
            counts); we do not use your prompt content to train any model.
          </li>
          <li>
            <strong>Usage data:</strong> request counts and token usage per billing period, used
            solely to enforce the limits of your subscription plan.
          </li>
          <li>
            <strong>Billing information:</strong> if you subscribe to a paid plan, payment is
            processed directly by Stripe. We store your Stripe customer/subscription reference and
            plan status — we never see or store your card or bank details.
          </li>
        </ul>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold text-ink">How we share information</h2>
        <p>We share data only with the service providers needed to run Prometheus:</p>
        <ul className="list-disc pl-5 flex flex-col gap-1">
          <li>
            <strong>OpenAI</strong> — processes the prompt text you submit for optimization.
          </li>
          <li>
            <strong>Stripe</strong> — processes payments for paid plans.
          </li>
          <li>
            <strong>Make.com</strong> — delivers transactional emails (sign-up verification,
            subscription expiry reminders) on our behalf; it receives your email address and the
            relevant link/message content for that email only.
          </li>
        </ul>
        <p>We do not sell your personal information to anyone.</p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold text-ink">The browser extension</h2>
        <p>
          The Prometheus extension reads and writes text in the input box of supported AI chat
          sites (ChatGPT, Claude, Gemini) only when you actively use the extension to optimize a
          prompt — it does not monitor your browsing or read page content otherwise. Your sign-in
          session is stored locally in the browser via{' '}
          <code className="rounded bg-surface-raised px-1 py-0.5 font-mono text-ink">
            chrome.storage.local
          </code>{' '}
          and is
          only sent to Prometheus&apos;s own servers to authenticate API requests.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold text-ink">Data retention and deletion</h2>
        <p>
          We retain account and usage data for as long as your account is active. To request
          deletion of your account and associated data, contact us at the address below.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold text-ink">Children&apos;s privacy</h2>
        <p>Prometheus is not directed at, and is not knowingly used by, children under 13.</p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold text-ink">Contact</h2>
        <p>
          Questions about this policy or your data? Email{' '}
          <a className="text-glow-cyan underline" href="mailto:iamkurtrainiersacay@gmail.com">
            iamkurtrainiersacay@gmail.com
          </a>
          .
        </p>
      </section>
    </main>
  );
}
