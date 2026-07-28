// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

/**
 * Shared flat config for packages/* and apps/extension (apps/web uses its
 * own eslintrc-format config via eslint-config-next, which Next.js's
 * lint runner auto-detects and keeps separate from this flat config).
 */
export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: ['**/dist/**', '**/.next/**', '**/node_modules/**', '**/.turbo/**'],
  },
  {
    languageOptions: {
      globals: { ...globals.browser },
    },
  },
  {
    files: ['**/*.cjs', '**/*.config.{js,cjs,mjs,ts}'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
);
