import type { Metadata } from 'next';
import { JsonLd } from '@/components/JsonLd';
import { CtaPanel, PageHero, StyleCards } from '@/components/Sections';
import { getSite } from '@/lib/api';
import { breadcrumbLd } from '@/lib/seo';

export async function generateMetadata(): Promise<Metadata> {
  const { studio } = await getSite();
  return {
    title: `Tattoo Styles in ${studio.city}`,
    description: `Fine line, micro realism, floral, lettering, Balinese and more — browse every tattoo style at ${studio.name}.`,
    alternates: { canonical: '/styles' },
  };
}

export default async function StylesIndex() {
  const { studio, styles } = await getSite();
  const crumbs = [{ name: 'Home', path: '/' }, { name: 'Tattoo styles', path: '/styles' }];
  return (
    <>
      <PageHero eyebrow={studio.name} title={`Tattoo styles in ${studio.city}`} motif="leaf" crumbs={crumbs}
        intro="Fine line is our signature, and our artists cover every style below. Pick one to see recent work and who to book." />
      <section className="section" aria-label="All styles"><div className="wrap">
        <StyleCards styles={styles} />
      </div></section>
      <CtaPanel />
      <JsonLd data={breadcrumbLd(crumbs)} />
    </>
  );
}
