const COLORS = {
  surface: '#0d1220',
  surfaceRaised: '#131a2c',
  line: '#1c2438',
  ink: '#e8edf7',
  inkMuted: '#8b96ad',
  glow: '#3b82f6',
  cyan: '#22d3ee',
};

export interface PrometheusOverlay {
  showBadge: (anchor: DOMRect) => void;
  hideBadge: () => void;
  showLoading: () => void;
  showResult: (prompt: string, notes: string[], onReplace: () => void) => void;
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

  const style = document.createElement('style');
  style.textContent = `
    .badge {
      position: fixed;
      pointer-events: auto;
      display: none;
      align-items: center;
      gap: 6px;
      padding: 6px 10px;
      border-radius: 999px;
      border: 1px solid ${COLORS.glow}66;
      background: ${COLORS.surfaceRaised};
      color: ${COLORS.ink};
      font: 500 12px/1.2 -apple-system, system-ui, sans-serif;
      box-shadow: 0 0 0 1px rgba(59,130,246,0.3), 0 0 10px rgba(59,130,246,0.3), 0 4px 12px rgba(0,0,0,0.4);
      cursor: pointer;
      transition: transform 0.12s ease, box-shadow 0.12s ease;
    }
    .badge:hover {
      transform: translateY(-1px);
      box-shadow: 0 0 0 1px rgba(59,130,246,0.5), 0 0 16px rgba(59,130,246,0.45), 0 4px 14px rgba(0,0,0,0.45);
    }
    .dot {
      width: 6px; height: 6px; border-radius: 999px;
      background: linear-gradient(135deg, ${COLORS.glow}, ${COLORS.cyan});
      flex: none;
    }
    .card {
      position: fixed;
      pointer-events: auto;
      display: none;
      width: 320px;
      max-height: 360px;
      overflow-y: auto;
      border-radius: 12px;
      border: 1px solid ${COLORS.line};
      background: ${COLORS.surface};
      color: ${COLORS.ink};
      font: 400 13px/1.5 -apple-system, system-ui, sans-serif;
      box-shadow: 0 0 0 1px rgba(59,130,246,0.15), 0 12px 32px rgba(0,0,0,0.5);
      padding: 12px;
    }
    .card h3 { margin: 0 0 8px; font-size: 11px; font-weight: 700; color: ${COLORS.inkMuted}; text-transform: uppercase; letter-spacing: 0.06em; }
    .card p.body { white-space: pre-wrap; margin: 0 0 10px; }
    .card ul { margin: 0 0 10px; padding-left: 16px; color: ${COLORS.inkMuted}; font-size: 11px; }
    .card .actions { display: flex; gap: 8px; }
    .card button {
      flex: 1;
      border: none;
      border-radius: 8px;
      padding: 8px 10px;
      font: 600 12px/1 -apple-system, system-ui, sans-serif;
      cursor: pointer;
    }
    .card .replace { background: linear-gradient(135deg, ${COLORS.glow}, ${COLORS.cyan}); color: white; }
    .card .copy { background: ${COLORS.surfaceRaised}; color: ${COLORS.ink}; border: 1px solid ${COLORS.line}; }
    .card .close { position: absolute; top: 8px; right: 10px; background: none; border: none; color: ${COLORS.inkMuted}; cursor: pointer; font-size: 14px; flex: none; padding: 2px 6px; }
    .card .error { color: #f87171; margin: 0; }
    .row { display: flex; align-items: center; gap: 8px; color: ${COLORS.inkMuted}; }
    .spinner { width: 14px; height: 14px; border-radius: 999px; border: 2px solid rgba(255,255,255,0.2); border-top-color: ${COLORS.cyan}; animation: spin 0.7s linear infinite; flex: none; }
    @keyframes spin { to { transform: rotate(360deg); } }
  `;
  shadow.appendChild(style);

  const badge = document.createElement('div');
  badge.className = 'badge';
  badge.innerHTML = '<span class="dot"></span><span>Improve this prompt?</span>';
  shadow.appendChild(badge);

  const card = document.createElement('div');
  card.className = 'card';
  shadow.appendChild(card);

  let badgeClickHandler: (() => void) | null = null;
  badge.addEventListener('click', () => badgeClickHandler?.());

  let lastAnchor: DOMRect | null = null;
  const OFFSET_Y = 8;

  function position(el: HTMLElement, anchor: DOMRect, offsetY: number) {
    el.style.left = `${Math.max(8, anchor.left)}px`;
    el.style.top = `${anchor.bottom + offsetY}px`;
  }

  /**
   * The badge often sits near the bottom of the viewport (chat composers are
   * typically pinned there), so anchoring the card below it — like a normal
   * tooltip — pushes it off-screen. Measure the card's real size first, then
   * flip above the anchor when there isn't room below, and clamp
   * horizontally so it never runs past the right edge either.
   */
  function positionCard(anchor: DOMRect) {
    card.style.visibility = 'hidden';
    card.style.display = 'block';

    const cardHeight = card.offsetHeight;
    const cardWidth = card.offsetWidth;

    const spaceBelow = window.innerHeight - anchor.bottom;
    const top =
      spaceBelow >= cardHeight + OFFSET_Y
        ? anchor.bottom + OFFSET_Y
        : Math.max(8, anchor.top - cardHeight - OFFSET_Y);

    const left = Math.max(8, Math.min(anchor.left, window.innerWidth - cardWidth - 8));

    card.style.top = `${top}px`;
    card.style.left = `${left}px`;
    card.style.visibility = 'visible';
  }

  function attachClose() {
    card.querySelector('.close')?.addEventListener('click', () => overlay.hide());
  }

  const overlay: PrometheusOverlay = {
    showBadge(anchor) {
      lastAnchor = anchor;
      position(badge, anchor, 6);
      badge.style.display = 'flex';
    },
    hideBadge() {
      badge.style.display = 'none';
    },
    showLoading() {
      card.innerHTML = `
        <button class="close">&times;</button>
        <h3>Prometheus</h3>
        <div class="row"><span class="spinner"></span> Optimizing…</div>
      `;
      attachClose();
      if (lastAnchor) positionCard(lastAnchor);
      badge.style.display = 'none';
    },
    showResult(prompt, notes, onReplace) {
      const notesHtml = notes.length
        ? `<ul>${notes.map((n) => `<li>${escapeHtml(n)}</li>`).join('')}</ul>`
        : '';
      card.innerHTML = `
        <button class="close">&times;</button>
        <h3>Improved prompt</h3>
        <p class="body">${escapeHtml(prompt)}</p>
        ${notesHtml}
        <div class="actions">
          <button class="replace">Replace</button>
          <button class="copy">Copy</button>
        </div>
      `;
      attachClose();
      card.querySelector('.replace')?.addEventListener('click', () => {
        onReplace();
        overlay.hide();
      });
      card.querySelector('.copy')?.addEventListener('click', () => {
        void navigator.clipboard.writeText(prompt);
        const copyBtn = card.querySelector('.copy');
        if (copyBtn) copyBtn.textContent = 'Copied ✓';
      });
      if (lastAnchor) positionCard(lastAnchor);
    },
    showError(message) {
      card.innerHTML = `
        <button class="close">&times;</button>
        <h3>Prometheus</h3>
        <p class="error">${escapeHtml(message)}</p>
      `;
      attachClose();
      if (lastAnchor) positionCard(lastAnchor);
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
