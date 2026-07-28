/** Shared Tailwind theme so apps/web and apps/extension render consistently.
 *  Apps consume this via `presets: [require('@prometheus/ui/tailwind-preset.cjs')]`.
 *  Kept as .cjs (not .js) so it's unambiguously CommonJS even though this
 *  package's package.json sets "type": "module".
 */
module.exports = {
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f2f4ff',
          100: '#e6e9ff',
          500: '#4f46e5',
          600: '#4338ca',
          700: '#3730a3',
        },
      },
      borderRadius: {
        DEFAULT: '0.5rem',
      },
    },
  },
};
