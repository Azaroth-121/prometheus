import type { Config } from 'tailwindcss';

/**
 * Extension-only theme — deliberately not layered on the shared
 * @prometheus/ui preset (which apps/web also uses). The popup is a
 * distinct, compact surface from the web dashboard and gets its own
 * local component set (src/popup/ui.tsx) instead of @prometheus/ui, so
 * this can't leak into the web app's look.
 *
 * Colours are CSS variables (src/popup/index.css) so the popup follows the
 * system light/dark setting. Brand = the logo's blue → cyan; solid brand
 * blue (#2563eb) carries white text at 5.2:1 in both themes.
 */
const config: Config = {
  content: ['./src/popup/**/*.{ts,tsx,html}'],
  theme: {
    extend: {
      colors: {
        canvas: 'rgb(var(--canvas) / <alpha-value>)',
        surface: 'rgb(var(--surface) / <alpha-value>)',
        line: 'rgb(var(--line) / <alpha-value>)',
        ink: 'rgb(var(--ink) / <alpha-value>)',
        'ink-muted': 'rgb(var(--ink-muted) / <alpha-value>)',
        brand: {
          DEFAULT: '#2563eb',
          hover: '#1d4ed8',
          soft: 'rgb(var(--brand-soft) / <alpha-value>)',
          text: 'rgb(var(--brand-text) / <alpha-value>)',
        },
        danger: 'rgb(var(--danger) / <alpha-value>)',
        warning: 'rgb(var(--warning) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['ui-sans-serif', 'system-ui', '-apple-system', '"Segoe UI"', 'Roboto', 'Arial', 'sans-serif'],
      },
    },
  },
};

export default config;
