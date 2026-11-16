import type { Artist, Branch, Faq, SiteContent, Studio } from './types';

/** Public address of the site, used for canonical URLs, sitemap and structured data. */
export function siteUrl() {
  return (process.env.SITE_URL || 'http://localhost:3000').replace(/\/$/, '');
}

export const abs = (path: string) => {
  let p = path.startsWith('/') ? path : `/${path}`;
  // Static (GitHub Pages) build serves pages as /path/ — match it so links don't redirect.
  if (process.env.STATIC_EXPORT === '1' && !p.endsWith('/') && !p.includes('#') && !/\.[a-z0-9]+$/i.test(p)) p += '/';
  return `${siteUrl()}${p}`;
};

/* ---------- schema.org structured data (JSON-LD) ---------- */

export function organizationLd(site: SiteContent) {
  const { studio } = site;
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': abs('/#organization'),
    name: studio.name,
    url: siteUrl(),
    logo: abs('/icon.svg'),
    email: studio.email,
    foundingDate: String(studio.established),
    sameAs: Object.values(studio.social),
    aggregateRating: ratingLd(studio),
    subOrganization: site.branches.map((b) => ({ '@id': abs(`/studios/${b.id}#parlor`) })),
  };
}

export function websiteLd(studio: Studio) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': abs('/#website'),
    name: studio.name,
    url: siteUrl(),
    inLanguage: 'en',
    publisher: { '@id': abs('/#organization') },
  };
}

function ratingLd(studio: Studio) {
  return {
    '@type': 'AggregateRating',
    ratingValue: studio.rating.score,
    reviewCount: studio.rating.count,
    bestRating: 5,
  };
}

/** One TattooParlor (a LocalBusiness type) per studio branch — helps Google Maps/local search. */
export function parlorLd(studio: Studio, branch: Branch) {
  const [opens, closes] = [branch.opens, branch.closes];
  return {
    '@context': 'https://schema.org',
    '@type': 'TattooParlor',
    '@id': abs(`/studios/${branch.id}#parlor`),
    name: `${studio.name} ${branch.name}`,
    url: abs(`/studios/${branch.id}`),
    image: abs('/og.png'),
    telephone: `+${branch.whatsapp}`,
    email: studio.email,
    priceRange: studio.priceRange,
    parentOrganization: { '@id': abs('/#organization') },
    address: {
      '@type': 'PostalAddress',
      streetAddress: branch.address.street,
      addressLocality: branch.address.locality,
      addressRegion: branch.address.region,
      postalCode: branch.address.postalCode,
      addressCountry: branch.address.country,
    },
    ...(branch.geo && { geo: { '@type': 'GeoCoordinates', latitude: branch.geo.lat, longitude: branch.geo.lng } }),
    hasMap: branch.mapsUrl,
    openingHoursSpecification: [
      {
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
        opens,
        closes,
      },
    ],
  };
}

export function faqLd(faqs: Faq[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };
}

export function personLd(studio: Studio, artist: Artist, branch?: Branch) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: artist.name,
    jobTitle: `Tattoo artist — ${artist.role}`,
    description: artist.bio,
    url: abs(`/artists/${artist.id}`),
    worksFor: branch ? { '@id': abs(`/studios/${branch.id}#parlor`) } : { '@id': abs('/#organization') },
  };
}

export function breadcrumbLd(items: { name: string; path: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: it.name,
      item: abs(it.path),
    })),
  };
}
