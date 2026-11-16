import 'server-only';
import { cache } from 'react';
import type { SiteContent } from './types';

const API = process.env.API_INTERNAL_URL || 'http://localhost:4000';

/**
 * Loads all studio content from the NestJS API. Wrapped in React `cache` so a
 * page, its metadata and its layout share one request per visitor.
 */
export const getSite = cache(async (): Promise<SiteContent> => {
  const res = await fetch(`${API}/api/site`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`API /api/site responded ${res.status}`);
  return res.json();
});

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
