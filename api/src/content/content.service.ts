import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../db/prisma.service';
import { Accent, Artist, Branch, PrepTip, SiteContent, Studio, Work } from './content.types';

const CACHE_MS = 15_000;

/**
 * Public website content, read from the database (edited in Admin) and returned in the
 * same shape as the old studio.json, so the website code did not need to change.
 * Results are cached for 15 seconds.
 */
@Injectable()
export class ContentService {
  private cache: { at: number; data: SiteContent } | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async get(): Promise<SiteContent> {
    if (this.cache && Date.now() - this.cache.at < CACHE_MS) return this.cache.data;
    const data = await this.load();
    this.cache = { at: Date.now(), data };
    return data;
  }

  private async load(): Promise<SiteContent> {
    const [settings, outlets, styles, artists, gallery, faqs, reviews] = await Promise.all([
      this.prisma.siteSetting.findMany(),
      this.prisma.outlet.findMany({ where: { isActive: true }, orderBy: [{ sort: 'asc' }, { name: 'asc' }] }),
      this.prisma.style.findMany({ where: { isPublic: true }, orderBy: [{ sort: 'asc' }, { name: 'asc' }] }),
      this.prisma.artist.findMany({
        where: { isPublic: true, isActive: true },
        include: { specialties: { include: { style: { select: { slug: true } } } }, homeOutlet: { select: { slug: true } } },
        orderBy: [{ sort: 'asc' }, { displayName: 'asc' }],
      }),
      this.prisma.galleryItem.findMany({
        where: { isPublic: true },
        include: { artist: { select: { slug: true, isPublic: true } }, style: { select: { slug: true } } },
        orderBy: [{ sort: 'asc' }, { createdAt: 'desc' }],
      }),
      this.prisma.faq.findMany({ where: { isPublic: true }, orderBy: { sort: 'asc' } }),
      this.prisma.review.findMany({ where: { isPublic: true }, orderBy: { sort: 'asc' } }),
    ]);
    const s = Object.fromEntries(settings.map((r) => [r.key, r.value]));

    const branches: Branch[] = outlets.map((o) => ({
      id: o.slug,
      name: o.name,
      badge: o.badge,
      area: o.area,
      address: { street: o.street, locality: o.locality, region: o.region, postalCode: o.postalCode, country: o.country },
      hours: o.hoursText,
      opens: o.opens,
      closes: o.closes,
      whatsapp: o.whatsapp,
      mapsUrl: o.mapsUrl,
      geo: o.lat != null && o.lng != null ? { lat: o.lat, lng: o.lng } : null,
      intro: o.intro,
    }));

    const artistList: Artist[] = artists.map((a) => ({
      id: a.slug,
      name: a.displayName,
      role: a.role,
      branch: a.homeOutlet?.slug ?? '',
      years: a.years,
      motif: a.motif,
      photo: a.photo,
      bio: a.bio,
      specialties: a.specialties.map((sp) => sp.style.slug),
    }));

    const works: Work[] = gallery
      .filter((g) => !g.artist || g.artist.isPublic)
      .map((g) => ({
        id: g.code,
        style: g.style?.slug ?? '',
        artist: g.artist?.slug ?? '',
        placement: g.placement,
        size: g.size,
        motif: g.motif,
        image: g.image,
      }));

    return {
      studio: (s.studio ?? {}) as unknown as Studio,
      branches,
      styles: styles.map((st) => ({ id: st.slug, name: st.name, badge: st.badge, motif: st.motif, image: st.image, description: st.description })),
      artists: artistList,
      gallery: works,
      reviews: reviews.map((r) => ({ name: r.name, text: r.text, artist: r.artist })),
      faqs: faqs.map((f) => ({ q: f.question, a: f.answer })),
      accents: (s.accents ?? {}) as unknown as Record<string, Accent>,
      prep: (s.prep ?? []) as unknown as PrepTip[],
    };
  }

  async branch(id: string) {
    const c = await this.get();
    const branch = c.branches.find((b) => b.id === id);
    if (!branch) throw new NotFoundException(`Studio "${id}" not found`);
    return {
      ...branch,
      artists: c.artists.filter((a) => a.branch === id),
      gallery: c.gallery.filter((w) => c.artists.find((a) => a.id === w.artist)?.branch === id),
    };
  }

  async style(id: string) {
    const c = await this.get();
    const style = c.styles.find((s) => s.id === id);
    if (!style) throw new NotFoundException(`Style "${id}" not found`);
    return { ...style, gallery: c.gallery.filter((w) => w.style === id), artists: c.artists.filter((a) => a.specialties.includes(id)) };
  }

  async artist(id: string) {
    const c = await this.get();
    const artist = c.artists.find((a) => a.id === id);
    if (!artist) throw new NotFoundException(`Artist "${id}" not found`);
    return { ...artist, gallery: c.gallery.filter((w) => w.artist === id) };
  }

  async gallery(filter: { style?: string; artist?: string; branch?: string }): Promise<Work[]> {
    const c = await this.get();
    return c.gallery.filter(
      (w) =>
        (!filter.style || w.style === filter.style) &&
        (!filter.artist || w.artist === filter.artist) &&
        (!filter.branch || c.artists.find((a) => a.id === w.artist)?.branch === filter.branch),
    );
  }
}
