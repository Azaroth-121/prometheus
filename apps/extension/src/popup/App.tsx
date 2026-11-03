/// <reference types="chrome" />
import { useEffect, useState, type FormEvent, type KeyboardEvent } from 'react';
import type { OptimizationMode, OptimizeSuccessResponse, UsageSummary } from '@prometheus/shared-types';
import { isOptimizeError, OPTIMIZATION_MODES } from '@prometheus/shared-types';
import { getUsage, optimize, submitOutcome } from '../lib/api';
import { getStoredSession, signIn, signOut } from '../lib/session';
import { Button, Chips, Field, Logo, Menu, Spinner, TextArea, UsagePill } from './ui';

// Same origin the extension calls for the API -- apps/web serves both.
const WEB_APP_URL: string = import.meta.env.VITE_API_BASE_URL;

// Mirrors packages/billing/src/plans.ts maximumInputLength.
const MAX_INPUT = { free: 2000, paid: 4000 };

const SITE_NAMES: Record<string, string> = { chatgpt: 'ChatGPT', claude: 'Claude', gemini: 'Gemini' };

/** The chat site in the active tab, if the content script is running there (see content/index.ts). */
async function findChatTab(): Promise<{ tabId: number; site: string } | null> {
  if (!globalThis.chrome?.tabs) return null;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id === undefined) return null;
  try {
    const reply = (await chrome.tabs.sendMessage(tab.id, { type: 'PROMETHEUS_PING' })) as { site?: string } | undefined;
    return reply?.site ? { tabId: tab.id, site: reply.site } : null;
  } catch {
    return null; // no content script on this page
  }
}

function Header({ usage, menu }: { usage: UsageSummary | null; menu?: React.ReactNode }) {
  return (
    <header className="flex h-14 items-center gap-2 border-b border-line px-4">
      <Logo />
      <span className="text-[15px] font-semibold tracking-tight text-ink">Prometheus</span>
      <span className="ml-auto flex items-center gap-3">
        {usage && <UsagePill used={usage.requests_used} limit={usage.requests_limit} />}
        {menu}
      </span>
    </header>
  );
}

export default function App() {
  const [isSignedIn, setIsSignedIn] = useState<boolean | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState(false);

  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [chatTab, setChatTab] = useState<{ tabId: number; site: string } | null>(null);

  const [input, setInput] = useState('');
  const [mode, setMode] = useState<OptimizationMode>('standard');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<OptimizeSuccessResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [limitReached, setLimitReached] = useState(false);
  const [done, setDone] = useState<'copied' | 'inserted' | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const [feedbackSent, setFeedbackSent] = useState(false);

  useEffect(() => {
    getStoredSession().then((session) => {
      setIsSignedIn(Boolean(session));
      setUserEmail(session?.email ?? null);
    });
    void findChatTab().then(setChatTab);
  }, []);

  function refreshUsage() {
    getUsage()
      .then((u) => {
        setUsage(u);
        setLimitReached(u.requests_used >= u.requests_limit);
      })
      .catch(() => setUsage(null));
  }

  useEffect(() => {
    if (isSignedIn) refreshUsage();
  }, [isSignedIn]);

  const maxInput = usage && usage.plan_code !== 'free' ? MAX_INPUT.paid : MAX_INPUT.free;

  async function handleSignIn(event: FormEvent) {
    event.preventDefault();
    setAuthBusy(true);
    setAuthError(null);
    const outcome = await signIn(email, password);
    setAuthBusy(false);
    if (!outcome.ok) {
      setAuthError(outcome.error);
      return;
    }
    setPassword('');
    setIsSignedIn(true);
    setUserEmail(email);
  }

  async function handleSignOut() {
    await signOut();
    setIsSignedIn(false);
    setUserEmail(null);
    setUsage(null);
    setResult(null);
    setError(null);
  }

  async function runOptimize() {
    if (!input.trim() || busy) return;
    setBusy(true);
    setError(null);
    setDone(null);
    setShowNotes(false);
    setFeedbackSent(false);
    try {
      const response = await optimize({
        input,
        source: 'extension_popup',
        mode,
        page_context: null,
        client_request_id: crypto.randomUUID(),
      });
      if (isOptimizeError(response)) {
        if (response.error.code === 'USAGE_LIMIT_REACHED') setLimitReached(true);
        else setError(response.error.message);
      } else {
        setResult(response);
        refreshUsage();
      }
    } catch {
      setError("Couldn't reach Prometheus. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    void runOptimize();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      void runOptimize();
    }
  }

  async function handleCopy() {
    if (!result) return;
    await navigator.clipboard.writeText(result.optimized_prompt);
    setDone('copied');
    void submitOutcome(result.request_id, 'accepted');
  }

  async function handleInsert() {
    if (!result || !chatTab) return;
    try {
      const reply = (await chrome.tabs.sendMessage(chatTab.tabId, {
        type: 'PROMETHEUS_INSERT',
        text: result.optimized_prompt,
      })) as { ok?: boolean } | undefined;
      if (!reply?.ok) throw new Error('not inserted');
      setDone('inserted');
      void submitOutcome(result.request_id, 'accepted');
    } catch {
      setError(`Couldn't find the ${SITE_NAMES[chatTab.site] ?? 'chat'} message box. Click into it, then try again — or use Copy.`);
    }
  }

  function handleNotHelpful() {
    if (!result) return;
    setFeedbackSent(true);
    void submitOutcome(result.request_id, 'rejected');
  }

  function handleTryAgain() {
    if (!result) return;
    void submitOutcome(result.request_id, 'retried');
    void runOptimize();
  }

  const menu = (
    <Menu
      label={`Account menu${userEmail ? ` for ${userEmail}` : ''}`}
      items={[
        { label: 'Plan & billing', href: `${WEB_APP_URL}/dashboard/billing` },
        { label: 'Account settings', href: `${WEB_APP_URL}/dashboard/settings` },
        { label: 'Help & FAQs', href: `${WEB_APP_URL}/dashboard/faqs` },
        { label: 'Sign out', onSelect: handleSignOut },
      ]}
    />
  );

  return (
    <div className="flex min-h-[540px] w-[380px] flex-col bg-canvas font-sans text-ink">
      {isSignedIn === null && <div className="flex-1" aria-busy="true" />}

      {isSignedIn === false && (
        <>
          <Header usage={null} />
          <main className="flex flex-1 flex-col gap-5 px-5 py-6">
            <div className="flex flex-col gap-1.5">
              <h1 className="text-xl font-semibold tracking-tight">Sign in to Prometheus</h1>
              <p className="text-sm leading-relaxed text-ink-muted">
                Turn rough requests into clear, structured prompts right inside ChatGPT, Claude and Gemini.
              </p>
            </div>
            <form className="flex flex-col gap-3" onSubmit={handleSignIn}>
              <Field label="Email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              <Field
                label="Password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              {authError && (
                <p role="alert" className="text-sm text-danger">
                  {authError}
                </p>
              )}
              <Button type="submit" disabled={authBusy} className="mt-1 w-full">
                {authBusy ? <Spinner /> : null}
                {authBusy ? 'Signing in…' : 'Sign in'}
              </Button>
            </form>
            <p className="text-sm text-ink-muted">
              New here?{' '}
              <a href={`${WEB_APP_URL}/register`} target="_blank" rel="noreferrer" className="font-medium text-brand-text hover:underline">
                Create a free account
              </a>
            </p>
          </main>
        </>
      )}

      {isSignedIn === true && !result && (
        <>
          <Header usage={usage} menu={menu} />
          <main className="flex flex-1 flex-col gap-4 px-5 py-5">
            {limitReached ? (
              <section className="flex flex-1 flex-col justify-center gap-3 text-center">
                <h1 className="text-lg font-semibold">You've used all {usage?.requests_limit ?? ''} optimizations this month</h1>
                <p className="text-sm leading-relaxed text-ink-muted">
                  Upgrade for more each month, or wait for your allowance to reset
                  {usage?.expires_at ? ` on ${new Date(usage.expires_at).toLocaleDateString()}` : ''}.
                </p>
                <a
                  href={`${WEB_APP_URL}/dashboard/billing`}
                  target="_blank"
                  rel="noreferrer"
                  className="mx-auto mt-2 inline-flex min-h-10 items-center rounded-lg bg-brand px-5 text-sm font-semibold text-white hover:bg-brand-hover"
                >
                  See plans
                </a>
              </section>
            ) : (
              <form className="flex flex-1 flex-col gap-3" onSubmit={handleSubmit}>
                <label htmlFor="request" className="text-sm font-semibold">
                  What do you want to ask?
                </label>
                <TextArea
                  id="request"
                  placeholder="e.g. write an email to my team about the new release"
                  value={input}
                  maxLength={maxInput}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  autoFocus
                />
                <div className="flex items-center justify-between">
                  <Chips label="Type of request" options={OPTIMIZATION_MODES} value={mode} onChange={setMode} />
                  <span className="text-[12px] tabular-nums text-ink-muted">
                    {input.length}/{maxInput}
                  </span>
                </div>
                {error && (
                  <p role="alert" className="text-sm text-danger">
                    {error}
                  </p>
                )}
                <Button type="submit" disabled={busy || input.trim().length === 0} className="mt-auto w-full">
                  {busy ? <Spinner /> : null}
                  {busy ? 'Optimizing…' : 'Optimize'}
                  {!busy && <kbd className="ml-1 text-[11px] font-normal text-white/75">Ctrl+Enter</kbd>}
                </Button>
                {!chatTab && (
                  <p className="text-center text-[12px] leading-relaxed text-ink-muted">
                    Tip: on ChatGPT, Claude or Gemini, pause after typing and click the Prometheus badge.
                  </p>
                )}
              </form>
            )}
          </main>
        </>
      )}

      {isSignedIn === true && result && (
        <>
          <Header usage={usage} menu={menu} />
          <main className="flex flex-1 flex-col gap-3 px-5 py-4">
            <button
              type="button"
              onClick={() => {
                setResult(null);
                setError(null);
              }}
              className="self-start rounded-md text-sm font-medium text-brand-text hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
            >
              ← Edit request
            </button>
            <h1 className="text-sm font-semibold">Optimized prompt</h1>
            <div className="max-h-[260px] overflow-y-auto whitespace-pre-wrap rounded-lg border border-line bg-surface p-3 text-[14px] leading-relaxed">
              {result.optimized_prompt}
            </div>
            {result.upgrade_notes.length > 0 && (
              <div>
                <button
                  type="button"
                  aria-expanded={showNotes}
                  onClick={() => setShowNotes((v) => !v)}
                  className="text-sm font-medium text-ink-muted hover:text-ink"
                >
                  {showNotes ? '▾' : '▸'} What changed ({result.upgrade_notes.length})
                </button>
                {showNotes && (
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-[13px] leading-relaxed text-ink-muted">
                    {result.upgrade_notes.map((note, i) => (
                      <li key={i}>{note}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            {error && (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            )}
            <div className="mt-auto flex flex-col gap-2">
              <div className="flex gap-2">
                {chatTab && (
                  <Button onClick={handleInsert} className="flex-1">
                    {done === 'inserted' ? 'Inserted ✓' : `Insert into ${SITE_NAMES[chatTab.site] ?? 'chat'}`}
                  </Button>
                )}
                <Button variant={chatTab ? 'secondary' : 'primary'} onClick={handleCopy} className="flex-1">
                  {done === 'copied' ? 'Copied ✓' : 'Copy'}
                </Button>
              </div>
              <div className="flex justify-center gap-1">
                <Button variant="ghost" onClick={handleTryAgain} disabled={busy}>
                  {busy ? 'Trying again…' : 'Try again'}
                </Button>
                <Button variant="ghost" onClick={handleNotHelpful} disabled={feedbackSent}>
                  {feedbackSent ? 'Thanks for the feedback' : 'Not helpful'}
                </Button>
              </div>
            </div>
          </main>
        </>
      )}
    </div>
  );
}
