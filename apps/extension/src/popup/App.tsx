import { useEffect, useState, type FormEvent } from 'react';
import { signInWithPassword, signOut } from '@prometheus/auth';
import type { OptimizationMode, OptimizeSuccessResponse } from '@prometheus/shared-types';
import { isOptimizeError } from '@prometheus/shared-types';
import { Button, Card, Input } from '@prometheus/ui';
import { optimize } from '../lib/api';
import { supabase } from '../lib/supabase';

const MODES: OptimizationMode[] = ['standard', 'image', 'code'];

export default function App() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignedIn, setIsSignedIn] = useState<boolean | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState(false);

  const [input, setInput] = useState('');
  const [mode, setMode] = useState<OptimizationMode>('standard');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<OptimizeSuccessResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setIsSignedIn(Boolean(data.session)));
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsSignedIn(Boolean(session));
    });
    return () => subscription.subscription.unsubscribe();
  }, []);

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
    <div className="w-80 p-4">
      <h1 className="mb-3 text-lg font-semibold">Prometheus</h1>

      {isSignedIn === false && (
        <Card className="flex flex-col gap-3">
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
            {authError && <p className="text-sm text-red-600">{authError}</p>}
            <Button type="submit" disabled={authBusy}>
              {authBusy ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>
          <p className="text-xs text-gray-500">
            Prometheus never executes your request — it only returns an improved prompt.
          </p>
        </Card>
      )}

      {isSignedIn === true && (
        <Card className="flex flex-col gap-3">
          <form className="flex flex-col gap-2" onSubmit={handleOptimize}>
            <select
              className="rounded border border-gray-300 px-2 py-1 text-sm"
              value={mode}
              onChange={(e) => setMode(e.target.value as OptimizationMode)}
            >
              {MODES.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <textarea
              className="h-24 w-full rounded border border-gray-300 p-2 text-sm"
              placeholder="Paste your rough prompt..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              required
            />
            <Button type="submit" disabled={busy || input.trim().length === 0}>
              {busy ? 'Optimizing…' : 'Optimize'}
            </Button>
          </form>

          {error && <p className="text-sm text-red-600">{error}</p>}

          {result && (
            <div className="flex flex-col gap-2 rounded border border-gray-200 p-2 text-sm">
              <p className="whitespace-pre-wrap">{result.optimized_prompt}</p>
              {result.upgrade_notes.length > 0 && (
                <ul className="list-disc pl-4 text-xs text-gray-600">
                  {result.upgrade_notes.map((note, i) => (
                    <li key={i}>{note}</li>
                  ))}
                </ul>
              )}
              <Button type="button" variant="secondary" onClick={handleCopy}>
                {copied ? 'Copied' : 'Copy'}
              </Button>
              <p className="text-xs text-gray-500">
                {result.usage.remaining_requests} requests remaining
              </p>
            </div>
          )}

          <div className="flex items-center justify-between text-xs">
            <Button type="button" variant="ghost" disabled title="Billing isn't wired up yet">
              Upgrade
            </Button>
            <a
              href="http://localhost:3000/dashboard"
              target="_blank"
              rel="noreferrer"
              className="text-brand-700 hover:underline"
            >
              Settings
            </a>
            <button type="button" onClick={handleSignOut} className="text-gray-500 hover:underline">
              Sign out
            </button>
          </div>
        </Card>
      )}
    </div>
  );
}
