export interface SiteAdapter {
  id: string;
  matches: (hostname: string) => boolean;
  findInput: () => HTMLElement | null;
}

/** Narrower than this is a search box or a rename field, not a chat composer. */
const MIN_COMPOSER_WIDTH = 200;

/**
 * The chat composer an element belongs to, or null. Used for whatever the
 * user focuses, so the badge keeps working when a site renames its composer
 * and the selectors below stop matching (ChatGPT dropped #prompt-textarea in
 * late 2026 and the badge silently never appeared).
 */
export function asComposer(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof HTMLElement)) return null;
  const el =
    target.tagName === 'TEXTAREA'
      ? target
      : target.isContentEditable
        ? (target.closest<HTMLElement>('[contenteditable="true"]') ?? target)
        : null;
  if (!el || el.getBoundingClientRect().width < MIN_COMPOSER_WIDTH) return null;
  return el;
}

/**
 * None of these sites publish a stable API for this — selectors are a
 * best-effort snapshot and will need occasional updates when these sites
 * ship redesigns. Each has a fallback to a more generic selector, and
 * content/index.ts also attaches to any composer the user focuses.
 */
export const SITE_ADAPTERS: SiteAdapter[] = [
  {
    id: 'chatgpt',
    matches: (hostname) => hostname === 'chatgpt.com' || hostname === 'chat.openai.com',
    findInput: () =>
      document.querySelector<HTMLElement>('#prompt-textarea') ??
      document.querySelector<HTMLElement>('[data-testid="prompt-textarea"]') ??
      document.querySelector<HTMLElement>('form div[contenteditable="true"]') ??
      document.querySelector<HTMLElement>('form textarea'),
  },
  {
    id: 'claude',
    matches: (hostname) => hostname === 'claude.ai',
    findInput: () =>
      document.querySelector<HTMLElement>('div[contenteditable="true"].ProseMirror') ??
      document.querySelector<HTMLElement>('div[contenteditable="true"]'),
  },
  {
    id: 'gemini',
    matches: (hostname) => hostname === 'gemini.google.com',
    findInput: () =>
      document.querySelector<HTMLElement>('rich-textarea .ql-editor') ??
      document.querySelector<HTMLElement>('div[contenteditable="true"]'),
  },
];

export function getActiveSiteAdapter(): SiteAdapter | null {
  return SITE_ADAPTERS.find((adapter) => adapter.matches(window.location.hostname)) ?? null;
}

function isTextArea(el: HTMLElement): el is HTMLTextAreaElement {
  return el.tagName === 'TEXTAREA';
}

export function getText(el: HTMLElement): string {
  return isTextArea(el) ? el.value : (el.textContent ?? '');
}

const nativeTextAreaValueSetter = Object.getOwnPropertyDescriptor(
  window.HTMLTextAreaElement.prototype,
  'value',
)?.set;

/**
 * A plain `.value =` or `.textContent =` assignment doesn't register with
 * the host page's own React/ProseMirror/Quill state — these frameworks only
 * see changes that come through their normal input pipeline. The native
 * setter + dispatched `input` event (for <textarea>) and execCommand (for
 * contenteditable, still the most reliable cross-editor way to do this
 * despite its general deprecation) both route through that pipeline.
 */
export function setText(el: HTMLElement, text: string): void {
  if (isTextArea(el)) {
    nativeTextAreaValueSetter?.call(el, text);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return;
  }

  el.focus();
  const selection = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(el);
  selection?.removeAllRanges();
  selection?.addRange(range);
  document.execCommand('insertText', false, text);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}
