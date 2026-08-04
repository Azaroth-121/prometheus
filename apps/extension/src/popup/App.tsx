import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { signInWithPassword, signOut } from '@prometheus/auth';
import type { OptimizationMode, OptimizeSuccessResponse } from '@prometheus/shared-types';
import { isOptimizeError } from '@prometheus/shared-types';
import { optimize } from '../lib/api';
import { supabase } from '../lib/supabase';

const MODE_OPTIONS: Array<{ value: OptimizationMode; label: string; description: string }> = [
  { value: 'standard', label: 'General', description: 'Everyday tasks' },
  { value: 'image', label: 'Visual', description: 'Image prompts' },
  { value: 'code', label: 'Code', description: 'Technical work' },
];

const UPGRADE_TIERS = [
  { price: 20, label: 'Starter', description: 'For occasional projects' },
  { price: 50, label: 'Pro', description: 'For consistent workflows', featured: true },
  { price: 100, label: 'Power', description: 'For high-volume work' },
];

const WEB_APP_URL = 'https://prometheus-azaroth.vercel.app';
const SETTINGS_SITE_URL = 'https://soveraign.solutions/prometheus/';

type Tab = 'optimize' | 'billing' | 'settings';
const TABS: Array<{ value: Tab; label: string }> = [
  { value: 'optimize', label: 'Optimize' },
  { value: 'billing', label: 'Plans' },
  { value: 'settings', label: 'Account' },
];

function BrandMark() {
  return (
    <div className="brand-mark" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none">
        <path
          d="M13.2 2.5c.4 3.1-1.8 4.4-3.4 6.3-1.4 1.7-2.3 3.4-1.5 5.7.5-1.5 1.6-2.4 2.9-3.3-.1 2.1 1.3 3.1 2.1 4.4.5-.9.8-1.8.7-2.9 1.5 1.3 2.2 2.7 2 4.2-.3 2.6-2.5 4.6-5.2 4.8-3.7.2-6.6-2.3-6.6-5.9 0-4.8 4-7 6.4-10.6.9-1.4 1.6-3 1.2-6z"
          fill="currentColor"
        />
      </svg>
    </div>
  );
}

function ArrowIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="h-4 w-4">
      <path d="M4 10h12m-4-4 4 4-4 4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function SparkleIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="h-4 w-4">
      <path d="M10 2.5c.5 4.1 2.3 5.9 6.5 6.5-4.2.5-6 2.3-6.5 6.5C9.5 11.3 7.7 9.5 3.5 9 7.7 8.4 9.5 6.6 10 2.5Z" fill="currentColor" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="h-4 w-4">
      <rect x="6.5" y="6.5" width="9" height="9" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M13 6V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h1" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="settings-link">
      <span>{children}</span>
      <ArrowIcon />
    </a>
  );
}

export default function App() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignedIn, setIsSignedIn] = useState<boolean | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [tab, setTab] = useState<Tab>('optimize');
  const [input, setInput] = useState('');
  const [mode, setMode] = useState<OptimizationMode>('standard');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<OptimizeSuccessResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setIsSignedIn(Boolean(data.session));
      setUserEmail(data.session?.user.email ?? null);
    });
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsSignedIn(Boolean(session));
      setUserEmail(session?.user.email ?? null);
    });
    return () => subscription.subscription.unsubscribe();
  }, []);

  async function handleSignIn(event: FormEvent) {
    event.preventDefault();
    setAuthBusy(true);
    setAuthError(null);
    try {
      const { error: signInError } = await signInWithPassword(supabase, { email, password });
      if (signInError) setAuthError(signInError.message);
    } catch {
      setAuthError('We could not sign you in. Check your connection and try again.');
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleSignOut() {
    await signOut(supabase);
    setResult(null);
    setError(null);
    setInput('');
    setTab('optimize');
  }

  async function handleOptimize(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setResult(null);
    setCopied(false);
    try {
      const response = await optimize({
        input: input.trim(),
        source: 'extension_popup',
        mode,
        page_context: null,
        client_request_id: crypto.randomUUID(),
      });
      if (isOptimizeError(response)) setError(response.error.message);
      else setResult(response);
    } catch {
      setError('The optimization service is unavailable. Please try again in a moment.');
    } finally {
      setBusy(false);
    }
  }

  async function handleCopy() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.optimized_prompt);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError('Clipboard access was blocked. Select the prompt and copy it manually.');
    }
  }

  if (isSignedIn === null) {
    return (
      <main className="popup-shell flex min-h-[240px] items-center justify-center" aria-live="polite">
        <div className="flex flex-col items-center gap-3 text-center">
          <BrandMark />
          <div>
            <p className="text-sm font-semibold text-slate-900">Opening Prometheus</p>
            <p className="mt-1 text-xs text-slate-500">Preparing your workspace...</p>
          </div>
          <div className="loading-bar" aria-hidden="true"><span /></div>
        </div>
      </main>
    );
  }

  return (
    <main className="popup-shell">
      <header className="app-header">
        <div className="flex items-center gap-2.5">
          <BrandMark />
          <div>
            <h1 className="text-[15px] font-bold tracking-tight text-slate-950">Prometheus</h1>
            <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-slate-400">Prompt intelligence</p>
          </div>
        </div>
        {isSignedIn && <div className="status-pill"><span className="status-dot" />Ready</div>}
      </header>

      {!isSignedIn && (
        <section className="px-5 pb-5 pt-3">
          <div className="mb-5">
            <div className="eyebrow"><SparkleIcon /> Better prompts, faster</div>
            <h2 className="mt-3 text-[25px] font-bold leading-[1.12] tracking-[-0.035em] text-slate-950">Turn rough ideas into clear instructions.</h2>
            <p className="mt-2 text-[13px] leading-5 text-slate-500">Sign in to transform any request into a structured, copy-ready prompt.</p>
          </div>
          <form className="flex flex-col gap-3" onSubmit={handleSignIn}>
            <label className="field-group"><span>Email address</span><input className="field-input" type="email" placeholder="you@example.com" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" disabled={authBusy} required /></label>
            <label className="field-group"><span>Password</span><input className="field-input" type="password" placeholder="Enter your password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" disabled={authBusy} required /></label>
            {authError && <div className="error-banner" role="alert">{authError}</div>}
            <button type="submit" className="primary-button mt-1" disabled={authBusy}>{authBusy ? <><span className="spinner" /> Signing in...</> : <>Sign in <ArrowIcon /></>}</button>
          </form>
          <p className="mt-4 text-center text-xs text-slate-500">New to Prometheus?{' '}<a href={`${WEB_APP_URL}/register`} target="_blank" rel="noreferrer" className="font-semibold text-indigo-600 hover:text-indigo-700">Create an account</a></p>
          <div className="privacy-note"><span aria-hidden="true">&#10003;</span>Your prompts are improved, never executed.</div>
        </section>
      )}

      {isSignedIn && (
        <>
          <nav className="tab-list" aria-label="Prometheus sections" role="tablist">
            {TABS.map((item) => <button key={item.value} type="button" role="tab" aria-selected={tab === item.value} onClick={() => setTab(item.value)} className={tab === item.value ? 'active' : ''}>{item.label}</button>)}
          </nav>
          <section className="px-4 pb-4 pt-3">
            {tab === 'optimize' && (
              <div className="animate-in">
                <div className="mb-3 px-1"><h2 className="text-[17px] font-bold tracking-tight text-slate-950">Build a better prompt</h2><p className="mt-0.5 text-xs text-slate-500">Choose a mode, then add your rough request.</p></div>
                <form className="workspace-card" onSubmit={handleOptimize} aria-busy={busy}>
                  <fieldset disabled={busy}>
                    <legend className="sr-only">Optimization mode</legend>
                    <div className="mode-grid">
                      {MODE_OPTIONS.map((option) => <label key={option.value} className={mode === option.value ? 'selected' : ''}><input type="radio" name="mode" value={option.value} checked={mode === option.value} onChange={() => setMode(option.value)} className="sr-only" /><span>{option.label}</span><small>{option.description}</small></label>)}
                    </div>
                  </fieldset>
                  <div className="prompt-field">
                    <textarea placeholder="Describe what you want to accomplish..." value={input} onChange={(event) => setInput(event.target.value)} disabled={busy} aria-label="Prompt to optimize" required />
                    <div className="prompt-meta"><span>{input.length.toLocaleString()} characters</span>{input.length > 0 && !busy && <button type="button" onClick={() => setInput('')}>Clear</button>}</div>
                  </div>
                  <button type="submit" className="primary-button" disabled={busy || input.trim().length === 0}>{busy ? <><span className="spinner" /> Improving your prompt...</> : <><SparkleIcon /> Optimize prompt</>}</button>
                </form>
                {error && <div className="error-banner mt-3" role="alert">{error}</div>}
                {result && (
                  <article className="result-card animate-in" aria-live="polite">
                    <div className="result-header"><div><div className="eyebrow"><span className="status-dot" /> Optimized</div><h3>Your improved prompt</h3></div><button type="button" className={copied ? 'copy-button copied' : 'copy-button'} onClick={handleCopy}>{copied ? 'Copied!' : <><CopyIcon /> Copy</>}</button></div>
                    <div className="result-copy">{result.optimized_prompt}</div>
                    {result.upgrade_notes.length > 0 && <div className="notes-panel"><p>What changed</p><ul>{result.upgrade_notes.map((note, index) => <li key={index}>{note}</li>)}</ul></div>}
                    <footer className="result-footer"><span>{result.usage.remaining_requests.toLocaleString()} requests remaining</span><button type="button" onClick={() => { setInput(''); setResult(null); }}>Start another</button></footer>
                  </article>
                )}
              </div>
            )}

            {tab === 'billing' && (
              <div className="animate-in">
                <div className="mb-4 px-1"><h2 className="text-[17px] font-bold tracking-tight text-slate-950">Choose your access</h2><p className="mt-1 text-xs leading-5 text-slate-500">One payment gives you 30 days. No recurring subscription.</p></div>
                <div className="flex flex-col gap-2">
                  {UPGRADE_TIERS.map((tier) => <a key={tier.price} href={`${WEB_APP_URL}/dashboard/billing`} target="_blank" rel="noreferrer" className={tier.featured ? 'plan-card featured' : 'plan-card'}><div><div className="flex items-center gap-2"><strong>{tier.label}</strong>{tier.featured && <span>Popular</span>}</div><small>{tier.description}</small></div><div className="text-right"><strong>${tier.price}</strong><small>30 days</small></div></a>)}
                </div>
                <p className="mt-3 px-1 text-[11px] leading-4 text-slate-400">Payments open securely in the Prometheus dashboard.</p>
              </div>
            )}

            {tab === 'settings' && (
              <div className="animate-in">
                <div className="account-card"><div className="avatar" aria-hidden="true">{userEmail?.charAt(0).toUpperCase() ?? 'P'}</div><div className="min-w-0"><p>Signed in as</p><strong className="block truncate">{userEmail ?? 'Unknown account'}</strong></div></div>
                <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-white"><ExternalLink href={`${WEB_APP_URL}/dashboard/settings`}>Account settings</ExternalLink><ExternalLink href={`${WEB_APP_URL}/dashboard/faqs`}>Help & FAQs</ExternalLink><ExternalLink href={SETTINGS_SITE_URL}>Visit Prometheus</ExternalLink></div>
                <button type="button" onClick={handleSignOut} className="sign-out-button">Sign out</button>
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}
