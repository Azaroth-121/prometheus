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
};

export default nextConfig;
