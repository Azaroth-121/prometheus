import type { Config } from 'tailwindcss';

/**
 * Extension-only dark theme — deliberately not layered on the shared
 * @prometheus/ui preset (which apps/web also uses). The popup is a
 * distinct, compact surface from the web dashboard and gets its own
 * local component set (src/popup/ui.tsx) instead of @prometheus/ui, so
 * this can't leak into the web app's look.
 */
const config: Config = {
  content: ['./src/popup/**/*.{ts,tsx,html}'],
  theme: {
    extend: {
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

export default config;
