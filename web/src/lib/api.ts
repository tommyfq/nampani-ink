import 'server-only';
import { readFile } from 'fs/promises';
import { resolve } from 'path';
import { unstable_noStore as noStore } from 'next/cache';
import { cache } from 'react';
import type { SiteContent } from './types';

const API = process.env.API_INTERNAL_URL || 'http://localhost:4000';

/** True for the GitHub Pages build (static HTML, no server, no API). */
export const IS_STATIC = process.env.STATIC_EXPORT === '1';

/**
 * Loads all studio content. Wrapped in React `cache` so a page, its metadata and
 * its layout share one load.
 * - Server mode: fetched from the NestJS API, cached for 30 seconds.
 * - Static mode: read from studio.json once, at build time.
 */
export const getSite = cache(async (): Promise<SiteContent> => {
  if (IS_STATIC) {
    const file = resolve(process.env.CONTENT_FILE || '../api/content/studio.json');
    const raw = JSON.parse(await readFile(file, 'utf8'));
    delete raw._note;
    return raw as SiteContent;
  }
  // The API isn't running while the Docker image builds: don't pre-render then.
  if (process.env.NEXT_PHASE === 'phase-production-build') noStore();
  const res = await fetch(`${API}/api/site`, { next: { revalidate: 30 } });
  if (!res.ok) throw new Error(`API /api/site responded ${res.status}`);
  return res.json();
});

/** For dynamic routes: pre-build every page in static mode; on demand in server mode. */
export async function staticParams(kind: 'styles' | 'artists' | 'branches') {
  if (!IS_STATIC) return [];
  const site = await getSite();
  return site[kind].map((x) => ({ slug: x.id }));
}

export async function getStyle(slug: string) {
  const site = await getSite();
  return site.styles.find((s) => s.id === slug) ?? null;
}

export async function getArtist(slug: string) {
  const site = await getSite();
  return site.artists.find((a) => a.id === slug) ?? null;
}

export async function getBranch(slug: string) {
  const site = await getSite();
  return site.branches.find((b) => b.id === slug) ?? null;
}
