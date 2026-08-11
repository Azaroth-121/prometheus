/// <reference types="chrome" />
import { getActiveSiteAdapter, getText, setText } from './sites';
import { createOverlay } from './ui';
import type { OptimizeMessage, OptimizeMessageResponse } from '../background';

const MIN_LENGTH = 12;
const DEBOUNCE_MS = 900;

function init() {
  const adapter = getActiveSiteAdapter();
  if (!adapter) return;

  const overlay = createOverlay();
  let debounceTimer: ReturnType<typeof window.setTimeout> | undefined;
  let currentInput: HTMLElement | null = null;

  overlay.onBadgeClick(() => {
    if (!currentInput) return;
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

    chrome.runtime.sendMessage(message, (response: OptimizeMessageResponse) => {
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
