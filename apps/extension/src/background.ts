/// <reference types="chrome" />
import type {
  OptimizationMode,
  OptimizeRequestSource,
  OptimizeResponse,
} from '@prometheus/shared-types';
import { getAccessToken } from './lib/session';

/**
 * MV3 service worker. Content-script fetch() calls run in the page's own
 * origin and don't get the CORS exemption host_permissions gives privileged
 * extension contexts — so the content script never calls the API directly,
 * it messages this worker, which does the actual fetch (same pattern the
 * popup already gets "for free" as a privileged context).
 *
 * Token handling itself lives in ./lib/session.ts (shared with the popup) --
 * this file used to hand-roll its own copy of Supabase's storage-key format
 * and call Supabase's GoTrue refresh endpoint directly; now it just reads a
 * self-issued token from the same storage both contexts share.
 */

const API_BASE_URL: string = import.meta.env.VITE_API_BASE_URL;

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

async function handleOptimizeMessage(message: OptimizeMessage): Promise<OptimizeMessageResponse> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return { ok: false, error: 'NOT_SIGNED_IN' };
  }

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
  return { ok: true, data };
}

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  if (!isOptimizeMessage(message)) return undefined;

  // A rejection anywhere above (storage, refresh, fetch, JSON parsing) that
  // isn't caught here means sendResponse never fires, and the content
  // script's callback simply hangs forever — there's no timeout on the
  // other end of chrome.runtime.sendMessage. Wrapping the whole thing is
  // what actually matters, not catching each failure mode individually.
  handleOptimizeMessage(message)
    .catch(
      (err): OptimizeMessageResponse => ({ ok: false, error: 'NETWORK_ERROR', detail: String(err) }),
    )
    .then(sendResponse);

  return true; // keep the message channel open for the async sendResponse above
});
