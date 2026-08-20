import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // The access.test.ts suite starts a real Postgres container -- generous
    // timeout so a slow first-pull of the image doesn't flake the run.
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
