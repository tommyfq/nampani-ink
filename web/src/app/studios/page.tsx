import type { Metadata } from 'next';
import { JsonLd } from '@/components/JsonLd';
import { BranchCards, CtaPanel, PageHero } from '@/components/Sections';
import { getSite } from '@/lib/api';
import { breadcrumbLd, parlorLd } from '@/lib/seo';

export async function generateMetadata(): Promise<Metadata> {
  const { studio, branches } = await getSite();
  return {
    title: `Tattoo Studios in ${studio.city}`,
    description: `${studio.name} has ${branches.length} tattoo studios: ${branches.map((b) => b.name).join(', ')}. Opening hours, addresses and WhatsApp for each.`,
    alternates: { canonical: '/studios' },
  };
}

export default async function StudiosIndex() {
  const { studio, branches } = await getSite();
  const crumbs = [{ name: 'Home', path: '/' }, { name: 'Studios', path: '/studios' }];
  return (
    <>
      <PageHero eyebrow={studio.name} title={`Our tattoo studios in ${studio.city}`} motif="compass" crumbs={crumbs}
        intro="Same standard, same pricing, same hands. Every studio has its own WhatsApp and takes walk-ins when an artist is free." />
      <section className="section" aria-label="All studios"><div className="wrap">
        <BranchCards branches={branches} studioName={studio.name} />
      </div></section>
      <CtaPanel />
      {branches.map((b) => <JsonLd key={b.id} data={parlorLd(studio, b)} />)}
      <JsonLd data={breadcrumbLd(crumbs)} />
    </>
  );
}
