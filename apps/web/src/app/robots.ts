import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';

export default function robots(): MetadataRoute.Robots {
  const base = SITE_URL;

  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/dashboard', '/admin', '/api', '/verify-email'],
    },
    sitemap: `${base}/sitemap.xml`,
  };
}
