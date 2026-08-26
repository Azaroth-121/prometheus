/**
 * Extension session storage, self-issued-token edition. Replaces
 * @supabase/supabase-js's client + chrome.storage.local adapter entirely --
 * this module IS the storage adapter now, not a config option passed to an
 * SDK, since there's no SDK anymore. Same underlying mechanism
 * (chrome.storage.local, with a localStorage fallback for local
 * preview/tests where the extension API is absent) as before.
 */

const STORAGE_KEY = 'prometheus-session';
const API_BASE_URL: string = import.meta.env.VITE_API_BASE_URL;

export interface StoredSession {
  access_token: string;
  refresh_token: string;
  /** Unix seconds. Access tokens are short-lived (15 min server-side) --
   * this is only ever used as a "don't bother trying this token" hint;
   * the server is the real source of truth on expiry. */
  expires_at: number;
  email: string;
}

async function storageGet(key: string): Promise<string | null> {
  if (!globalThis.chrome?.storage?.local) return globalThis.localStorage.getItem(key);
  const result = await globalThis.chrome.storage.local.get(key);
  return (result[key] as string | undefined) ?? null;
}

async function storageSet(key: string, value: string): Promise<void> {
  if (!globalThis.chrome?.storage?.local) {
    globalThis.localStorage.setItem(key, value);
    return;
  }
  await globalThis.chrome.storage.local.set({ [key]: value });
}

async function storageRemove(key: string): Promise<void> {
  if (!globalThis.chrome?.storage?.local) {
    globalThis.localStorage.removeItem(key);
    return;
  }
  await globalThis.chrome.storage.local.remove(key);
}

export async function getStoredSession(): Promise<StoredSession | null> {
  const raw = await storageGet(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredSession;
  } catch {
    return null;
  }
}

async function setStoredSession(session: StoredSession): Promise<void> {
  await storageSet(STORAGE_KEY, JSON.stringify(session));
}

export async function clearStoredSession(): Promise<void> {
  await storageRemove(STORAGE_KEY);
}

/** Access tokens are issued with a 15-minute TTL server-side (@prometheus/auth's tokens.ts). */
const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

export async function signIn(email: string, password: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const response = await fetch(`${API_BASE_URL}/api/v1/auth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: 'Sign-in failed.' }));
    return { ok: false, error: body.error ?? 'Sign-in failed.' };
  }

  const { access_token, refresh_token, email: confirmedEmail } = (await response.json()) as {
    access_token: string;
    refresh_token: string;
    email: string;
  };

  await setStoredSession({
    access_token,
    refresh_token,
    expires_at: Date.now() / 1000 + ACCESS_TOKEN_TTL_SECONDS,
    email: confirmedEmail,
  });

  return { ok: true };
}

/**
 * Revocation is best-effort: local sign-out must never be blocked by a
 * network hiccup, but when it does reach the server the refresh token is
 * actually invalidated there too (not just forgotten locally).
 */
export async function signOut(): Promise<void> {
  const session = await getStoredSession();
  if (session?.refresh_token) {
    try {
      await fetch(`${API_BASE_URL}/api/v1/auth/revoke`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: session.refresh_token }),
      });
    } catch {
      // Best-effort; local sign-out proceeds regardless.
    }
  }
  await clearStoredSession();
}

/** Refreshes against POST /api/v1/auth/refresh and persists the new access token. */
export async function refreshSession(refreshToken: string): Promise<StoredSession | null> {
  const response = await fetch(`${API_BASE_URL}/api/v1/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  if (!response.ok) return null;

  const previous = await getStoredSession();
  const { access_token } = (await response.json()) as { access_token: string };
  const refreshed: StoredSession = {
    access_token,
    refresh_token: refreshToken,
    expires_at: Date.now() / 1000 + ACCESS_TOKEN_TTL_SECONDS,
    email: previous?.email ?? '',
  };
  await setStoredSession(refreshed);
  return refreshed;
}

const EXPIRY_BUFFER_SECONDS = 60;

/** Returns a usable access token, refreshing first if it's near/past expiry. */
export async function getAccessToken(): Promise<string | null> {
  const session = await getStoredSession();
  if (!session) return null;

  const nowSeconds = Date.now() / 1000;
  if (session.expires_at - nowSeconds > EXPIRY_BUFFER_SECONDS) {
    return session.access_token;
  }

  const refreshed = await refreshSession(session.refresh_token);
  return refreshed?.access_token ?? null;
}
