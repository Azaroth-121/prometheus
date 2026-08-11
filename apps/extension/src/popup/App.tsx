import { useEffect, useState, type FormEvent } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { signInWithPassword, signOut } from '@prometheus/auth';
import type { OptimizationMode, OptimizeSuccessResponse, UsageSummary } from '@prometheus/shared-types';
import { isOptimizeError } from '@prometheus/shared-types';
import { getUsage, optimize } from '../lib/api';
import { supabase } from '../lib/supabase';
import { Button, Glow, Input, Panel, SegmentedControl, TextArea } from './ui';

const MODES = ['standard', 'image', 'code'] as const satisfies readonly OptimizationMode[];

// Mirrors packages/billing/src/plans.ts — placeholder pricing. Each
// payment is one-time (30 days of access), not a recurring subscription.
const UPGRADE_TIERS = [{ price: 20 }, { price: 50 }, { price: 100 }];

const WEB_APP_URL = 'https://prometheus-azaroth.vercel.app';
const SETTINGS_SITE_URL = 'https://soveraign.solutions/prometheus/';

const TABS = ['optimize', 'billing', 'settings'] as const;
type Tab = (typeof TABS)[number];

const fadeSlide = {
  initial: { opacity: 0, y: 4 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -4 },
  transition: { duration: 0.15 },
};

function LoadingDots() {
  return (
    <span className="flex items-center justify-center gap-1 py-0.5">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="h-1.5 w-1.5 rounded-full bg-white"
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{ duration: 1, repeat: Infinity, delay: i * 0.15 }}
        />
      ))}
    </span>
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
  const [usage, setUsage] = useState<UsageSummary | null>(null);

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

  useEffect(() => {
    if (tab !== 'settings' || !isSignedIn) return;
    getUsage()
      .then(setUsage)
      .catch(() => setUsage(null));
  }, [tab, isSignedIn]);

  async function handleSignIn(event: FormEvent) {
    event.preventDefault();
    setAuthBusy(true);
    setAuthError(null);
    const { error: signInError } = await signInWithPassword(supabase, { email, password });
    setAuthBusy(false);
    if (signInError) {
      setAuthError(signInError.message);
    }
  }

  async function handleSignOut() {
    await signOut(supabase);
    setResult(null);
    setError(null);
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
        input,
        source: 'extension_popup',
        mode,
        page_context: null,
        client_request_id: crypto.randomUUID(),
      });
      if (isOptimizeError(response)) {
        setError(response.error.message);
      } else {
        setResult(response);
      }
    } catch {
      setError('Could not reach the optimization service.');
    } finally {
      setBusy(false);
    }
  }

  async function handleCopy() {
    if (!result) return;
    await navigator.clipboard.writeText(result.optimized_prompt);
    setCopied(true);
  }

  return (
    <div className="min-h-full w-80 bg-void bg-radial-glow p-4">
      <div className="mb-4 flex items-center gap-2">
        <Glow className="h-2.5 w-2.5" />
        <h1
          className="text-base font-semibold tracking-wide text-ink"
          style={{ textShadow: '0 0 14px rgba(59,130,246,0.45)' }}
        >
          Prometheus
        </h1>
      </div>

      {isSignedIn === false && (
        <Panel className="flex flex-col gap-3">
          <form className="flex flex-col gap-2" onSubmit={handleSignIn}>
            <Input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <Input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            {authError && <p className="text-sm text-red-400">{authError}</p>}
            <div className="flex items-center gap-3">
              <Button type="submit" disabled={authBusy} className="flex-1">
                {authBusy ? 'Signing in…' : 'Sign in'}
              </Button>
              <a
                href={`${WEB_APP_URL}/register`}
                target="_blank"
                rel="noreferrer"
                className="whitespace-nowrap text-sm text-glow-cyan hover:underline"
              >
                Sign up
              </a>
            </div>
          </form>
          <p className="text-xs text-ink-muted">
            Prometheus never executes your request — it only returns an improved prompt.
          </p>
        </Panel>
      )}

      {isSignedIn === true && (
        <Panel className="flex flex-col gap-3">
          <SegmentedControl options={TABS} value={tab} onChange={setTab} layoutId="main-tab" />

          <AnimatePresence mode="wait">
            {tab === 'optimize' && (
              <motion.div key="optimize" {...fadeSlide} className="flex flex-col gap-3">
                <form className="flex flex-col gap-2" onSubmit={handleOptimize}>
                  <SegmentedControl options={MODES} value={mode} onChange={setMode} layoutId="mode" />
                  <TextArea
                    placeholder="Paste your rough prompt..."
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    required
                  />
                  <Button type="submit" disabled={busy || input.trim().length === 0} className="w-full">
                    {busy ? <LoadingDots /> : 'Optimize'}
                  </Button>
                </form>

                {error && <p className="text-sm text-red-400">{error}</p>}

                <AnimatePresence>
                  {result && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.98 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="flex flex-col gap-2 rounded-lg border border-line bg-surface-raised p-3 text-sm"
                    >
                      <p className="whitespace-pre-wrap text-ink">{result.optimized_prompt}</p>
                      {result.upgrade_notes.length > 0 && (
                        <ul className="list-disc pl-4 text-xs text-ink-muted">
                          {result.upgrade_notes.map((note, i) => (
                            <li key={i}>{note}</li>
                          ))}
                        </ul>
                      )}
                      <Button variant="secondary" onClick={handleCopy}>
                        {copied ? 'Copied ✓' : 'Copy'}
                      </Button>
                      <p className="text-xs text-ink-muted">
                        {result.usage.remaining_requests} requests remaining
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )}

            {tab === 'billing' && (
              <motion.div key="billing" {...fadeSlide} className="flex flex-col gap-2 text-xs">
                <p className="text-ink-muted">
                  Each payment is one-time and grants 30 days of access — pay again anytime to
                  extend.
                </p>
                {UPGRADE_TIERS.map((tier) => (
                  <a
                    key={tier.price}
                    href={`${WEB_APP_URL}/dashboard/billing`}
                    target="_blank"
                    rel="noreferrer"
                    className="group flex items-center justify-between rounded-lg border border-line bg-surface-raised px-3 py-2 text-ink transition-all hover:border-glow/60 hover:shadow-glow-sm"
                  >
                    <span>
                      ${tier.price} <span className="text-ink-muted">/ 30 days</span>
                    </span>
                    <span className="text-glow-cyan transition-transform group-hover:translate-x-0.5">
                      Pay →
                    </span>
                  </a>
                ))}
              </motion.div>
            )}

            {tab === 'settings' && (
              <motion.div key="settings" {...fadeSlide} className="flex flex-col gap-2 text-xs">
                <p className="text-ink-muted">Signed in as</p>
                <p className="text-sm font-medium text-ink">{userEmail ?? 'unknown'}</p>

                {usage && (
                  <div className="mt-1 flex flex-col gap-2 rounded-lg border border-line bg-surface-raised p-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-ink">{usage.plan_name} plan</span>
                      {usage.expires_at && (
                        <span className="text-ink-muted">
                          until {new Date(usage.expires_at).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-col gap-1">
                      <div className="flex justify-between">
                        <span className="text-ink-muted">Requests</span>
                        <span className="text-ink-muted">
                          {usage.requests_used.toLocaleString()} / {usage.requests_limit.toLocaleString()}
                        </span>
                      </div>
                      <div className="h-1 w-full overflow-hidden rounded-full bg-white/10">
                        <div
                          className="h-full rounded-full bg-glow-cyan"
                          style={{
                            width: `${Math.min((usage.requests_used / Math.max(usage.requests_limit, 1)) * 100, 100)}%`,
                          }}
                        />
                      </div>
                    </div>
                    <div className="flex flex-col gap-1">
                      <div className="flex justify-between">
                        <span className="text-ink-muted">Tokens</span>
                        <span className="text-ink-muted">
                          {usage.tokens_used.toLocaleString()} / {usage.tokens_limit.toLocaleString()}
                        </span>
                      </div>
                      <div className="h-1 w-full overflow-hidden rounded-full bg-white/10">
                        <div
                          className="h-full rounded-full bg-glow-cyan"
                          style={{
                            width: `${Math.min((usage.tokens_used / Math.max(usage.tokens_limit, 1)) * 100, 100)}%`,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                )}

                <a
                  href={`${WEB_APP_URL}/dashboard/settings`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-glow-cyan hover:underline"
                >
                  Account settings
                </a>
                <a
                  href={`${WEB_APP_URL}/dashboard/faqs`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-glow-cyan hover:underline"
                >
                  FAQs
                </a>
                <a
                  href={SETTINGS_SITE_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="text-glow-cyan hover:underline"
                >
                  Visit our site
                </a>
                <Button variant="ghost" onClick={handleSignOut} className="mt-1 self-start text-left">
                  Sign out
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </Panel>
      )}
    </div>
  );
}
