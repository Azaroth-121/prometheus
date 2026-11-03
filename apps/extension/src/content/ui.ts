export interface PrometheusOverlay {
  showBadge: (anchor: DOMRect) => void;
  hideBadge: () => void;
  showLoading: () => void;
  showResult: (
    prompt: string,
    notes: string[],
    onReplace: () => void,
    onNotHelpful: () => void,
    onTryAgain: () => void,
  ) => void;
  showError: (message: string) => void;
  hide: () => void;
  onBadgeClick: (cb: () => void) => void;
}

function escapeHtml(input: string): string {
  const div = document.createElement('div');
  div.textContent = input;
  return div.innerHTML;
}

/**
 * The model often returns a numbered brief as one paragraph ("…: 1. Objective: … 2. Scope: …").
 * Put each item on its own line so it reads as a list here and in the chat box. Only when there
 * are at least two items, and only before "N. " followed by a capital, so "v2. x" or "3.5" stay.
 */
export function formatPrompt(prompt: string): string {
  const items = prompt.match(/(^|\s)\d{1,2}\.\s+[A-Z]/g) ?? [];
  if (items.length < 2 || /\n\s*\d{1,2}\.\s/.test(prompt)) return prompt;
  return prompt.replace(/\s+(\d{1,2})\.\s+(?=[A-Z])/g, '\n$1. ').replace(/:\n1\. /, ':\n\n1. ');
}

/** Light or dark to match the host page (its own theme, which may differ from the OS). */
function pageTheme(): 'light' | 'dark' {
  for (const el of [document.body, document.documentElement]) {
    const match = getComputedStyle(el).backgroundColor.match(/\d+(\.\d+)?/g);
    if (!match || match.length < 3 || (match[3] !== undefined && Number(match[3]) === 0)) continue;
    const [r, g, b] = match.slice(0, 3).map(Number) as [number, number, number];
    return 0.2126 * r + 0.7152 * g + 0.0722 * b < 128 ? 'dark' : 'light';
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

// Each copy needs its own gradient id: a gradient defined inside a hidden element (the badge while
// the card is open) does not paint anywhere else.
const flame = (id: string) => `<svg class="flame" viewBox="30 10 70 112" aria-hidden="true"><defs><linearGradient id="${id}" x1="15%" y1="0%" x2="85%" y2="100%"><stop offset="0%" stop-color="#3b82f6"/><stop offset="100%" stop-color="#22d3ee"/></linearGradient></defs><path fill="url(#${id})" d="M70 14 C 82 28 88 40 84 52 C 81 61 74 62 72 54 C 71 62 76 68 82 74 C 96 90 94 108 78 116 C 66 122 50 120 42 108 C 33 94 37 78 46 68 C 41 76 40 86 44 92 C 40 82 40 68 48 56 C 54 46 52 36 46 30 C 54 34 58 26 56 18 C 62 22 66 18 70 14 Z"/></svg>`;
const ICON_RETRY = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const ICON_DOWN = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H6.7a2 2 0 0 0-2 1.7l-1.4 9A2 2 0 0 0 5.3 15H10zM17 2h3v11h-3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const ICON_CLOSE = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;

/**
 * Everything lives inside a Shadow DOM root so the host page's styles can
 * never leak into ours (or vice versa) — important on pages whose own CSS
 * we don't control and shouldn't fight with class-name collisions.
 */
export function createOverlay(): PrometheusOverlay {
  const host = document.createElement('div');
  host.id = 'prometheus-overlay-host';
  host.style.cssText = 'position: fixed; z-index: 2147483647; top: 0; left: 0; pointer-events: none;';
  document.documentElement.appendChild(host);

  const shadow = host.attachShadow({ mode: 'open' });

  // Same palette as the popup (src/popup/index.css); contrast-checked in both themes.
  const style = document.createElement('style');
  style.textContent = `
    :host {
      --surface: #ffffff; --raised: #f6f7f9; --line: #e2e5ec; --ink: #101828; --muted: #545e70;
      --brand: #2563eb; --brand-hover: #1d4ed8; --brand-text: #1d4ed8; --danger: #b91c1c;
      --shadow: 0 1px 2px rgba(16,24,40,0.06), 0 12px 32px rgba(16,24,40,0.14);
    }
    :host([data-theme="dark"]) {
      --surface: #1b1e26; --raised: #232733; --line: #343a48; --ink: #f0f2f6; --muted: #a0a8b8;
      --brand-text: #8fb4ff; --danger: #fca5a5;
      --shadow: 0 1px 2px rgba(0,0,0,0.3), 0 16px 40px rgba(0,0,0,0.45);
    }
    * { box-sizing: border-box; }
    button { font: inherit; cursor: pointer; }
    button:focus-visible { outline: 2px solid var(--brand); outline-offset: 2px; }
    svg { width: 16px; height: 16px; flex: none; }
    .flame { width: 14px; height: 18px; }

    .badge {
      position: fixed; pointer-events: auto; display: none; align-items: center; gap: 6px;
      height: 30px; padding: 0 12px 0 10px; border-radius: 999px;
      border: 1px solid var(--line); background: var(--surface); color: var(--ink);
      font: 600 13px/1 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      box-shadow: var(--shadow); transition: border-color 0.12s ease, transform 0.12s ease;
    }
    .badge:hover { border-color: var(--brand); transform: translateY(-1px); }

    .card {
      position: fixed; pointer-events: auto; display: none; flex-direction: column;
      width: min(440px, calc(100vw - 16px)); border-radius: 14px;
      border: 1px solid var(--line); background: var(--surface); color: var(--ink);
      font: 400 14px/1.6 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      box-shadow: var(--shadow); overflow: hidden;
    }
    .card:focus { outline: none; }
    .head { display: flex; align-items: center; gap: 8px; padding: 12px 12px 10px 16px; border-bottom: 1px solid var(--line); }
    .head h2 { margin: 0; font-size: 14px; font-weight: 600; }
    .close { margin-left: auto; width: 32px; height: 32px; display: grid; place-items: center; border: 0; border-radius: 8px; background: none; color: var(--muted); }
    .close:hover { background: var(--raised); color: var(--ink); }
    .body { padding: 14px 16px; overflow-y: auto; }
    .prompt { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
    details { margin-top: 12px; color: var(--muted); font-size: 13px; }
    summary { cursor: pointer; font-weight: 600; list-style: none; }
    summary::-webkit-details-marker { display: none; }
    summary::before { content: "\\25B8"; display: inline-block; width: 14px; }
    details[open] summary::before { content: "\\25BE"; }
    details ul { margin: 6px 0 0; padding-left: 20px; }
    .foot { display: flex; align-items: center; gap: 8px; padding: 12px 16px; border-top: 1px solid var(--line); background: var(--raised); }
    .btn { height: 36px; padding: 0 16px; border-radius: 8px; font-size: 13px; font-weight: 600; border: 1px solid transparent; }
    .primary { background: var(--brand); color: #fff; }
    .primary:hover { background: var(--brand-hover); }
    .secondary { background: var(--surface); color: var(--ink); border-color: var(--line); }
    .secondary:hover { border-color: var(--muted); }
    .text { display: inline-flex; align-items: center; gap: 6px; height: 36px; padding: 0 8px; border: 0; border-radius: 8px; background: none; color: var(--muted); font-size: 13px; font-weight: 500; }
    .text:hover { color: var(--ink); background: var(--surface); }
    .text[disabled] { cursor: default; opacity: 0.7; }
    .spacer { flex: 1; }
    .error { margin: 0; color: var(--danger); }
    .loading { display: flex; flex-direction: column; gap: 10px; }
    .loading p { margin: 0 0 4px; color: var(--muted); font-size: 13px; }
    .bar { height: 10px; border-radius: 6px; background: linear-gradient(90deg, var(--raised), var(--line), var(--raised)); background-size: 200% 100%; animation: shimmer 1.2s linear infinite; }
    @keyframes shimmer { to { background-position: -200% 0; } }
    @media (prefers-reduced-motion: reduce) { .bar { animation: none; } .badge:hover { transform: none; } }
  `;
  shadow.appendChild(style);

  const badge = document.createElement('button');
  badge.type = 'button';
  badge.className = 'badge';
  badge.setAttribute('aria-label', 'Optimize this prompt with Prometheus');
  badge.innerHTML = `${flame('pf-badge')}<span>Optimize</span>`;
  shadow.appendChild(badge);

  const card = document.createElement('div');
  card.className = 'card';
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-label', 'Prometheus');
  card.tabIndex = -1;
  shadow.appendChild(card);
  card.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') overlay.hide();
  });

  let badgeClickHandler: (() => void) | null = null;
  badge.addEventListener('click', () => badgeClickHandler?.());

  let lastAnchor: DOMRect | null = null;
  const GAP = 10;

  function applyTheme() {
    host.dataset.theme = pageTheme();
  }

  /**
   * Chat composers sit at the bottom of the window, so the card opens ABOVE the composer,
   * left-aligned with it, as tall as the space allows (scrolling inside its body), and drops
   * below only when there's more room there. Clamped to the viewport horizontally.
   */
  function positionCard(anchor: DOMRect) {
    card.style.visibility = 'hidden';
    card.style.display = 'flex';
    const above = anchor.top - GAP - 8;
    const below = window.innerHeight - anchor.bottom - GAP - 8;
    const room = Math.max(above, below);
    const body = card.querySelector<HTMLElement>('.body');
    if (body) body.style.maxHeight = `${Math.max(160, Math.min(520, room) - 120)}px`;
    const height = card.offsetHeight;
    const width = card.offsetWidth;
    const top = above >= below ? Math.max(8, anchor.top - GAP - height) : anchor.bottom + GAP;
    const left = Math.max(8, Math.min(anchor.left, window.innerWidth - width - 8));
    card.style.top = `${top}px`;
    card.style.left = `${left}px`;
    card.style.visibility = 'visible';
  }

  function open(html: string) {
    applyTheme();
    card.innerHTML = `
      <div class="head">${flame('pf-card')}<h2>Prometheus</h2>
        <button type="button" class="close" aria-label="Close">${ICON_CLOSE}</button>
      </div>
      ${html}`;
    card.querySelector('.close')?.addEventListener('click', () => overlay.hide());
    badge.style.display = 'none';
    if (lastAnchor) positionCard(lastAnchor);
  }

  const overlay: PrometheusOverlay = {
    showBadge(anchor) {
      lastAnchor = anchor;
      applyTheme();
      badge.style.display = 'inline-flex';
      // Top-right corner of the composer, just above it.
      const width = badge.offsetWidth;
      badge.style.left = `${Math.max(8, Math.min(anchor.right - width, window.innerWidth - width - 8))}px`;
      badge.style.top = `${Math.max(8, anchor.top - badge.offsetHeight - 8)}px`;
    },
    hideBadge() {
      badge.style.display = 'none';
    },
    showLoading() {
      open(`
        <div class="body" aria-live="polite">
          <div class="loading">
            <p>Optimizing your prompt…</p>
            <div class="bar" style="width: 92%"></div>
            <div class="bar" style="width: 78%"></div>
            <div class="bar" style="width: 85%"></div>
            <div class="bar" style="width: 60%"></div>
          </div>
        </div>`);
    },
    showResult(prompt, notes, onReplace, onNotHelpful, onTryAgain) {
      const text = formatPrompt(prompt);
      const notesHtml = notes.length
        ? `<details><summary>What changed (${notes.length})</summary><ul>${notes.map((n) => `<li>${escapeHtml(n)}</li>`).join('')}</ul></details>`
        : '';
      open(`
        <div class="body"><p class="prompt">${escapeHtml(text)}</p>${notesHtml}</div>
        <div class="foot">
          <button type="button" class="btn primary replace">Replace my text</button>
          <button type="button" class="btn secondary copy">Copy</button>
          <span class="spacer"></span>
          <button type="button" class="text try-again">${ICON_RETRY}Try again</button>
          <button type="button" class="text not-helpful" aria-label="Not helpful">${ICON_DOWN}</button>
        </div>`);
      card.querySelector('.replace')?.addEventListener('click', () => {
        onReplace();
        overlay.hide();
      });
      card.querySelector('.copy')?.addEventListener('click', () => {
        void navigator.clipboard.writeText(text);
        const copyBtn = card.querySelector('.copy');
        if (copyBtn) copyBtn.textContent = 'Copied';
      });
      card.querySelector('.try-again')?.addEventListener('click', () => onTryAgain());
      card.querySelector('.not-helpful')?.addEventListener('click', () => {
        onNotHelpful();
        const btn = card.querySelector('.not-helpful');
        if (btn) {
          btn.setAttribute('disabled', 'true');
          btn.innerHTML = 'Thanks';
        }
      });
      card.focus({ preventScroll: true });
    },
    showError(message) {
      open(`<div class="body"><p class="error" role="alert">${escapeHtml(message)}</p></div>`);
    },
    hide() {
      card.style.display = 'none';
      badge.style.display = 'none';
    },
    onBadgeClick(cb) {
      badgeClickHandler = cb;
    },
  };

  return overlay;
}
