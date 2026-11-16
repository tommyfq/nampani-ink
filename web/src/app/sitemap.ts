import type { MetadataRoute } from 'next';
import { getSite } from '@/lib/api';
import { abs } from '@/lib/seo';

/** /sitemap.xml — every public page, built from the API content. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const site = await getSite();
  const now = new Date();
  const page = (path: string, priority: number, changeFrequency: 'weekly' | 'monthly' = 'weekly') => ({
    url: abs(path),
    lastModified: now,
    changeFrequency,
    priority,
  });

  return [
    page('/', 1),
    page('/styles', 0.8),
    page('/artists', 0.8),
    page('/studios', 0.9),
    ...site.branches.map((b) => page(`/studios/${b.id}`, 0.9)),
    ...site.styles.map((s) => page(`/styles/${s.id}`, 0.8)),
    ...site.artists.map((a) => page(`/artists/${a.id}`, 0.7)),
  ];
}
