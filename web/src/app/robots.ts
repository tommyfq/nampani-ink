import type { MetadataRoute } from 'next';
import { abs, siteUrl } from '@/lib/seo';

// Read SITE_URL when the container runs, not when the image is built.
export const dynamic = 'force-dynamic';

/** /robots.txt — allow everything except the API and customer uploads. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/api/', '/uploads/'] }],
    sitemap: abs('/sitemap.xml'),
    host: siteUrl(),
  };
}
