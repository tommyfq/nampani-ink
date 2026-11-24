/**
 * One-time move of website content from content/studio.json into the database,
 * plus the agreed default payment methods and revenue-sharing schemes.
 *   npm run db:import
 * Safe to run again: existing rows (matched by slug / code / key) are updated, not duplicated.
 */
import '../load-env';
import { PrismaClient, Prisma } from '@prisma/client';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import type { SiteContent } from '../content/content.types';

const prisma = new PrismaClient();

const OUTLET_CODES: Record<string, string> = { canggu: 'CGU', seminyak: 'SMY', uluwatu: 'ULW' };

async function main() {
  const file = resolve(process.env.CONTENT_FILE ?? 'content/studio.json');
  const c = JSON.parse(readFileSync(file, 'utf8')) as SiteContent;

  // Website settings
  for (const [key, value] of Object.entries({ studio: c.studio, accents: c.accents, prep: c.prep })) {
    const v = value as unknown as Prisma.InputJsonValue;
    await prisma.siteSetting.upsert({ where: { key }, update: { value: v }, create: { key, value: v } });
  }

  // Outlets
  const outletIds: Record<string, string> = {};
  for (const [sort, b] of c.branches.entries()) {
    const data = {
      code: OUTLET_CODES[b.id] ?? b.id.slice(0, 3).toUpperCase(),
      name: b.name,
      badge: b.badge,
      area: b.area,
      street: b.address.street,
      locality: b.address.locality,
      region: b.address.region,
      postalCode: b.address.postalCode,
      country: b.address.country,
      lat: b.geo?.lat ?? null,
      lng: b.geo?.lng ?? null,
      mapsUrl: b.mapsUrl,
      whatsapp: b.whatsapp,
      hoursText: b.hours,
      opens: b.opens,
      closes: b.closes,
      intro: b.intro,
      sort,
    };
    const o = await prisma.outlet.upsert({ where: { slug: b.id }, update: data, create: { slug: b.id, ...data } });
    outletIds[b.id] = o.id;
  }

  // Styles
  const styleIds: Record<string, string> = {};
  for (const [sort, s] of c.styles.entries()) {
    const data = { name: s.name, badge: s.badge, motif: s.motif, image: s.image, description: s.description, sort };
    const row = await prisma.style.upsert({ where: { slug: s.id }, update: data, create: { slug: s.id, ...data } });
    styleIds[s.id] = row.id;
  }

  // Artists
  const artistIds: Record<string, string> = {};
  for (const [sort, a] of c.artists.entries()) {
    const data = {
      displayName: a.name,
      role: a.role,
      bio: a.bio,
      photo: a.photo,
      motif: a.motif,
      years: a.years,
      sort,
      homeOutletId: outletIds[a.branch] ?? null,
    };
    const row = await prisma.artist.upsert({ where: { slug: a.id }, update: data, create: { slug: a.id, ...data } });
    artistIds[a.id] = row.id;
    await prisma.artistSpecialty.deleteMany({ where: { artistId: row.id } });
    await prisma.artistSpecialty.createMany({
      data: a.specialties.filter((id) => styleIds[id]).map((id) => ({ artistId: row.id, styleId: styleIds[id] })),
    });
  }

  // Gallery
  for (const [sort, w] of c.gallery.entries()) {
    const artist = c.artists.find((a) => a.id === w.artist);
    const data = {
      artistId: artistIds[w.artist] ?? null,
      styleId: styleIds[w.style] ?? null,
      outletId: artist ? outletIds[artist.branch] ?? null : null,
      image: w.image,
      placement: w.placement,
      size: w.size,
      motif: w.motif,
      sort,
    };
    await prisma.galleryItem.upsert({ where: { code: w.id }, update: data, create: { code: w.id, ...data } });
  }

  // FAQs and reviews (replaced as a whole)
  await prisma.faq.deleteMany();
  await prisma.faq.createMany({ data: c.faqs.map((f, sort) => ({ question: f.q, answer: f.a, sort })) });
  await prisma.review.deleteMany();
  await prisma.review.createMany({ data: c.reviews.map((r, sort) => ({ name: r.name, text: r.text, artist: r.artist, sort })) });

  // Default payment methods (fees are set by the owners in Admin)
  if ((await prisma.paymentMethod.count()) === 0) {
    await prisma.paymentMethod.createMany({
      data: [
        { name: 'Cash', type: 'CASH', sort: 0 },
        { name: 'Credit / debit card', type: 'CARD', requiresCode: true, sort: 1 },
        { name: 'Bank transfer', type: 'TRANSFER', requiresProof: true, sort: 2 },
        { name: 'QRIS', type: 'QRIS', requiresProof: true, sort: 3 },
      ],
    });
  }

  // Revenue schemes agreed in November 2026 (only if none exist yet)
  if ((await prisma.revenueScheme.count()) === 0) {
    await prisma.revenueScheme.create({
      data: {
        kind: 'TATTOO',
        name: 'Standard tattoo split',
        lines: {
          create: [
            { key: 'artist', label: 'Artist', bps: 4500, isArtist: true, sort: 0 },
            { key: 'management_tutut', label: 'Management fee — Tutut', bps: 500, group: 'management', sort: 1 },
            { key: 'management_yensen', label: 'Management fee — Yensen', bps: 500, group: 'management', sort: 2 },
            { key: 'marketing', label: 'Marketing', bps: 1000, sort: 3 },
            { key: 'rent', label: 'Rent', bps: 1000, sort: 4 },
            { key: 'operational', label: 'Operational', bps: 500, takesFees: true, sort: 5 },
            { key: 'investor', label: 'Investor', bps: 1000, sort: 6 },
            { key: 'save_cost', label: 'Save cost', bps: 1000, takesRemainder: true, sort: 7 },
          ],
        },
      },
    });
    await prisma.revenueScheme.create({
      data: {
        kind: 'FORFEITED_DP',
        name: 'Forfeited DP (cancel / no-show)',
        lines: {
          create: [
            { key: 'artist', label: 'Artist', bps: 9000, isArtist: true, takesRemainder: true, sort: 0 },
            { key: 'marketing', label: 'Marketing', bps: 1000, sort: 1 },
          ],
        },
      },
    });
  }

  const counts = {
    outlets: await prisma.outlet.count(),
    styles: await prisma.style.count(),
    artists: await prisma.artist.count(),
    gallery: await prisma.galleryItem.count(),
    faqs: await prisma.faq.count(),
    reviews: await prisma.review.count(),
    paymentMethods: await prisma.paymentMethod.count(),
    revenueSchemes: await prisma.revenueScheme.count(),
  };
  console.log('Imported:', counts);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
