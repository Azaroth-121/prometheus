/// <reference types="chrome" />
import type {
  OptimizationMode,
  OptimizeRequestSource,
  OptimizeResponse,
} from '@prometheus/shared-types';

/**
 * MV3 service worker. Content-script fetch() calls run in the page's own
 * origin and don't get the CORS exemption host_permissions gives privileged
 * extension contexts — so the content script never calls the API directly,
 * it messages this worker, which does the actual fetch (same pattern the
 * popup already gets "for free" as a privileged context).
 *
 * Reads the session straight out of chrome.storage.local rather than
 * instantiating @supabase/supabase-js here — storage is shared across every
 * extension context, so this reads the exact session the popup's client
 * already wrote, without pulling the SDK into the always-running worker.
 */

const SUPABASE_URL: string = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY: string = import.meta.env.VITE_SUPABASE_ANON_KEY;
const API_BASE_URL: string = import.meta.env.VITE_API_BASE_URL;

const EXPIRY_BUFFER_SECONDS = 60;

interface StoredSession {
  access_token: string;
  refresh_token: string;
  expires_at?: number;
}

function storageKey(): string {
  const ref = new URL(SUPABASE_URL).hostname.split('.')[0];
  return `sb-${ref}-auth-token`;
}

async function readStoredSession(): Promise<StoredSession | null> {
  const key = storageKey();
  const result = await chrome.storage.local.get(key);
  const raw = result[key] as string | undefined;
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredSession;
  } catch {
    return null;
  }
}

async function writeStoredSession(session: StoredSession): Promise<void> {
  await chrome.storage.local.set({ [storageKey()]: JSON.stringify(session) });
}

async function refreshSession(refreshToken: string): Promise<StoredSession | null> {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  if (!response.ok) return null;
  const session = (await response.json()) as StoredSession;
  await writeStoredSession(session);
  return session;
}

async function getAccessToken(): Promise<string | null> {
  const session = await readStoredSession();
  if (!session) return null;

  const expiresAt = session.expires_at ?? 0;
  const nowSeconds = Date.now() / 1000;
  if (expiresAt - nowSeconds > EXPIRY_BUFFER_SECONDS) {
    return session.access_token;
  }

  const refreshed = await refreshSession(session.refresh_token);
  return refreshed?.access_token ?? null;
}

export interface OptimizeMessage {
  type: 'OPTIMIZE_REQUEST';
  input: string;
  mode: OptimizationMode;
  source: OptimizeRequestSource;
  page_context: string | null;
  client_request_id: string;
}

export type OptimizeMessageResponse =
  | { ok: true; data: OptimizeResponse }
  | { ok: false; error: 'NOT_SIGNED_IN' | 'NETWORK_ERROR'; detail?: string };

function isOptimizeMessage(message: unknown): message is OptimizeMessage {
  return typeof message === 'object' && message !== null && (message as { type?: unknown }).type === 'OPTIMIZE_REQUEST';
}

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  if (!isOptimizeMessage(message)) return undefined;

  (async () => {
    const accessToken = await getAccessToken();
    if (!accessToken) {
      const response: OptimizeMessageResponse = { ok: false, error: 'NOT_SIGNED_IN' };
      sendResponse(response);
      return;
    }

    try {
      const apiResponse = await fetch(`${API_BASE_URL}/api/v1/optimize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          input: message.input,
          source: message.source,
          mode: message.mode,
          page_context: message.page_context,
          client_request_id: message.client_request_id,
        }),
      });
      const data = (await apiResponse.json()) as OptimizeResponse;
      const response: OptimizeMessageResponse = { ok: true, data };
      sendResponse(response);
    } catch (err) {
      const response: OptimizeMessageResponse = { ok: false, error: 'NETWORK_ERROR', detail: String(err) };
      sendResponse(response);
    }
  })();

  return true; // keep the message channel open for the async sendResponse above
});
