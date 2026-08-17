/// <reference types="chrome" />
import { getActiveSiteAdapter, getText, setText } from './sites';
import { createOverlay } from './ui';
import type { OptimizeMessage, OptimizeMessageResponse } from '../background';

const MIN_LENGTH = 12;
const DEBOUNCE_MS = 900;
const RESPONSE_TIMEOUT_MS = 25_000;

function init() {
  const adapter = getActiveSiteAdapter();
  if (!adapter) return;

  const overlay = createOverlay();
  let debounceTimer: ReturnType<typeof window.setTimeout> | undefined;
  let currentInput: HTMLElement | null = null;

  overlay.onBadgeClick(() => {
    if (!currentInput) return;

    // Reloading/updating the extension orphans any content script already
    // injected into a tab that was open beforehand: chrome.runtime.id goes
    // undefined in that orphaned script, and calling sendMessage on it either
    // throws synchronously or silently never calls back — the page just
    // looks hung until the 25s timeout below. Catch it immediately instead.
    if (!chrome.runtime?.id) {
      overlay.showError('Prometheus was updated — please refresh this page and try again.');
      return;
    }

    const text = getText(currentInput);
    overlay.showLoading();

    const message: OptimizeMessage = {
      type: 'OPTIMIZE_REQUEST',
      input: text,
      mode: 'standard',
      source: 'extension_inline',
      page_context: window.location.hostname,
      client_request_id: crypto.randomUUID(),
    };

    // background.ts should always sendResponse (success, error, or a caught
    // exception), but there's no built-in timeout on the other end of
    // sendMessage — if it ever doesn't, this is what stops the spinner from
    // running forever instead of leaving the user staring at "Optimizing…".
    let settled = false;
    const timeoutId = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      overlay.showError('This is taking too long. Please try again.');
    }, RESPONSE_TIMEOUT_MS);

    try {
      chrome.runtime.sendMessage(message, (response: OptimizeMessageResponse) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeoutId);

        if (!response?.ok) {
          overlay.showError(
            response?.error === 'NOT_SIGNED_IN'
              ? 'Sign in to Prometheus via the extension icon to use this.'
              : 'Could not reach the optimization service.',
          );
          return;
        }

        if ('error' in response.data) {
          overlay.showError(response.data.error.message);
          return;
        }

        const { optimized_prompt: optimizedPrompt, upgrade_notes: upgradeNotes } = response.data;
        overlay.showResult(optimizedPrompt, upgradeNotes, () => {
          if (currentInput) setText(currentInput, optimizedPrompt);
        });
      });
    } catch {
      // Belt-and-suspenders: chrome.runtime.id can still be truthy at the
      // check above and go stale by the time sendMessage actually runs.
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      overlay.showError('Prometheus was updated — please refresh this page and try again.');
    }
  });

  function handleInput() {
    overlay.hideBadge();
    window.clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(() => {
      if (!currentInput) return;
      const text = getText(currentInput);
      if (text.trim().length < MIN_LENGTH) return;
      overlay.showBadge(currentInput.getBoundingClientRect());
    }, DEBOUNCE_MS);
  }

  function attach(input: HTMLElement) {
    if (input === currentInput) return;
    currentInput = input;
    input.addEventListener('input', handleInput);
    input.addEventListener('keydown', () => overlay.hideBadge());
  }

  // These sites are SPAs — the composer often isn't in the DOM at initial
  // page load, so keep watching for it rather than querying once.
  const observer = new MutationObserver(() => {
    const input = adapter.findInput();
    if (input) attach(input);
  });
  observer.observe(document.body, { childList: true, subtree: true });

  const initial = adapter.findInput();
  if (initial) attach(initial);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
