/** @type {import('next').NextConfig} */
const nextConfig = {
  // standalone: produces a minimal, self-contained .next/standalone output
  // (its own node_modules subset copied in) instead of needing the full
  // monorepo node_modules tree present at runtime -- what the Dockerfile's
  // turbo-prune-based build actually copies into the final image.
  // (The Cloudflare build, `pnpm cf:build`, packages the app with OpenNext instead.)
  output: 'standalone',
  // Don't let Next bundle the Postgres driver. pg-cloudflare exports its real socket only
  // under the `workerd` condition and an empty stub otherwise; Next's bundler picked the stub,
  // breaking every query on Workers ("b2 is not a constructor"). Left external, OpenNext's
  // bundler resolves the workerd build; on Node (Azure) pg loads from node_modules as usual.
  serverExternalPackages: ['pg', 'pg-cloudflare'],
  transpilePackages: [
    '@prometheus/shared-types',
    '@prometheus/database',
    '@prometheus/auth',
    '@prometheus/ui',
    '@prometheus/billing',
    '@prometheus/prompts',
    '@prometheus/validation',
  ],
};

// Opt-in: `CF_DEV=1 pnpm dev` runs `next dev` with local Cloudflare bindings (wrangler.jsonc),
// so getCloudflareContext() works and the DB goes through the Hyperdrive local connection
// string. Off by default so plain `pnpm dev` keeps using DATABASE_URL as before.
if (process.env.CF_DEV === '1') {
  const { initOpenNextCloudflareForDev } = await import('@opennextjs/cloudflare');
  initOpenNextCloudflareForDev();
}

export default nextConfig;
