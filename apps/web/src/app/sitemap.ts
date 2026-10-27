import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';

// Only unauthenticated, publicly-linkable pages -- /dashboard, /admin, and
// account-flow pages (verify-email, etc.) require a session or a one-time
// token and have nothing for a crawler to index.
export default function sitemap(): MetadataRoute.Sitemap {
  const base = SITE_URL;
  const now = new Date();

  return [
    { url: `${base}/`, lastModified: now, changeFrequency: 'monthly', priority: 1 },
    { url: `${base}/login`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${base}/register`, lastModified: now, changeFrequency: 'yearly', priority: 0.8 },
    { url: `${base}/privacy`, lastModified: now, changeFrequency: 'yearly', priority: 0.2 },
    { url: `${base}/terms`, lastModified: now, changeFrequency: 'yearly', priority: 0.2 },
    { url: `${base}/cookie-policy`, lastModified: now, changeFrequency: 'yearly', priority: 0.1 },
    { url: `${base}/acceptable-use`, lastModified: now, changeFrequency: 'yearly', priority: 0.1 },
  ];
}
