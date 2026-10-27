/** @type {import('next').NextConfig} */
const nextConfig = {
  // standalone: produces a minimal, self-contained .next/standalone output
  // (its own node_modules subset copied in) instead of needing the full
  // monorepo node_modules tree present at runtime -- what the Dockerfile's
  // turbo-prune-based build actually copies into the final image.
  output: 'standalone',
  transpilePackages: [
    '@prometheus/shared-types',
    '@prometheus/database',
    '@prometheus/auth',
    '@prometheus/ui',
    '@prometheus/billing',
    '@prometheus/prompts',
    '@prometheus/validation',
  ],
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          // Tells browsers to use HTTPS for this origin even before the
          // first request -- covers the case middleware's redirect can't (a
          // cached bookmark or a typed http:// URL on a repeat visit).
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
        ],
      },
    ];
  },
};

export default nextConfig;
