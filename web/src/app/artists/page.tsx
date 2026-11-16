import type { Metadata } from 'next';
import { JsonLd } from '@/components/JsonLd';
import { ArtistCards, CtaPanel, PageHero } from '@/components/Sections';
import { getSite } from '@/lib/api';
import { breadcrumbLd } from '@/lib/seo';

export async function generateMetadata(): Promise<Metadata> {
  const { studio } = await getSite();
  return {
    title: `Tattoo Artists in ${studio.city}`,
    description: `Meet the tattoo artists at ${studio.name}: fine line, micro realism, lettering, Balinese and ornamental specialists.`,
    alternates: { canonical: '/artists' },
  };
}

export default async function ArtistsIndex() {
  const { studio, artists, branches } = await getSite();
  const crumbs = [{ name: 'Home', path: '/' }, { name: 'Artists', path: '/artists' }];
  return (
    <>
      <PageHero eyebrow={studio.name} title={`Tattoo artists in ${studio.city}`} motif="eye" crumbs={crumbs}
        intro="Each artist has a speciality. Book the person whose work you love, at the studio closest to you." />
      <section className="section on-dark" aria-label="All artists"><div className="wrap">
        <ArtistCards artists={artists} branches={branches} studioName={studio.name} />
      </div></section>
      <CtaPanel />
      <JsonLd data={breadcrumbLd(crumbs)} />
    </>
  );
}
