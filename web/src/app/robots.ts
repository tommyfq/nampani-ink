import type { MetadataRoute } from 'next';
import { unstable_noStore as noStore } from 'next/cache';
import { IS_STATIC } from '@/lib/api';
import { abs, siteUrl } from '@/lib/seo';

/** /robots.txt — allow everything except the API and customer uploads. */
export default function robots(): MetadataRoute.Robots {
  // Server mode: read SITE_URL when the container runs, not when the image is built.
  if (!IS_STATIC) noStore();
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/api/', '/uploads/'] }],
    sitemap: abs('/sitemap.xml'),
    host: siteUrl(),
  };
}
