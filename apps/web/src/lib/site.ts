// Next.js evaluates sitemap.ts/robots.ts and the root layout's metadataBase
// at build time (during `next build`'s page-data collection), not per
// request -- so NEXT_PUBLIC_APP_URL must be set in the environment of the
// build that gets deployed (e.g. `NEXT_PUBLIC_APP_URL=https://... pnpm
// cf:build` for Cloudflare). env.ts's `required()` getter throwing there
// would break every build that doesn't set it (CI's included), so these
// SEO-only consumers fall back to the local dev URL instead of using
// env.appUrl. No hosting provider's hostname is hard-coded here: the site is
// moving from Azure to Cloudflare and the final domain is set per deploy.
export const SITE_URL = (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');
