// Next.js evaluates sitemap.ts/robots.ts and the root layout's metadataBase
// at build time (during `next build`'s page-data collection), not per
// request -- and neither CI's build step nor the Docker build in
// .github/workflows/deploy.yml pass NEXT_PUBLIC_APP_URL as a build arg. env.ts's
// `required()` getter throwing there would break every build, not just a
// misconfigured one, so these SEO-only consumers fall back to the real
// deployed URL (see deploy.yml's HEALTH_URL) instead of using env.appUrl.
export const SITE_URL = (
  process.env.NEXT_PUBLIC_APP_URL ??
  'https://ca-prometheus-web-dev-eus2-01.delightfulcliff-8cc5b938.eastus2.azurecontainerapps.io'
).replace(/\/$/, '');
