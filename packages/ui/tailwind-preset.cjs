/** Shared Tailwind theme so apps/web and apps/extension render consistently.
 *  Apps consume this via `presets: [require('@prometheus/ui/tailwind-preset.cjs')]`.
 *  Kept as .cjs (not .js) so it's unambiguously CommonJS even though this
 *  package's package.json sets "type": "module".
 *
 *  Values are drawn from the same palette family as apps/extension's own
 *  Tailwind config (apps/extension/tailwind.config.ts) -- the popup's dark
 *  void/glow theme shipped first and reads well, so the web app now shares
 *  its token values rather than getting a second, disconnected identity.
 *  Kept as a separate preset instance (not a literal shared config) for the
 *  same reason the extension's own config gives: the popup is a distinct,
 *  compact surface from the web app and each needs to evolve independently.
 */
module.exports = {
  theme: {
    extend: {
      fontFamily: {
        display: ['var(--font-display)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        sans: ['var(--font-body)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      colors: {
        void: '#05070d',
        surface: '#0d1220',
        'surface-raised': '#131a2c',
        line: '#1c2438',
        ink: '#e8edf7',
        'ink-muted': '#8b96ad',
        glow: {
          DEFAULT: '#3b82f6',
          cyan: '#22d3ee',
          dim: '#1e3a63',
        },
        // Kept for any leftover references during the transition -- brand.500
        // now points at the same value as glow.DEFAULT rather than stock
        // Tailwind indigo, so nothing still using `brand-*` classes looks
        // visually orphaned.
        brand: {
          50: '#eef4ff',
          100: '#dbe7ff',
          500: '#3b82f6',
          600: '#2f6fe0',
          700: '#1e3a63',
        },
      },
      borderRadius: {
        DEFAULT: '0.5rem',
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(59,130,246,0.4), 0 0 16px rgba(59,130,246,0.35)',
        'glow-sm': '0 0 0 1px rgba(59,130,246,0.3), 0 0 8px rgba(59,130,246,0.25)',
        'glow-cyan': '0 0 0 1px rgba(34,211,238,0.4), 0 0 16px rgba(34,211,238,0.3)',
      },
      backgroundImage: {
        'radial-glow':
          'radial-gradient(circle at 50% 0%, rgba(59,130,246,0.16), transparent 60%)',
        'brand-gradient': 'linear-gradient(135deg, #3b82f6 0%, #22d3ee 100%)',
      },
    },
  },
};
