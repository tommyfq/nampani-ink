import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { BookingForm } from '@/components/BookingForm';
import { Gallery } from '@/components/Gallery';
import { JsonLd } from '@/components/JsonLd';
import { ArtistCards, BranchCards, CtaPanel, FaqSection, PageHero, SectionHead } from '@/components/Sections';
import { getBranch, getSite, staticParams } from '@/lib/api';
import { breadcrumbLd, parlorLd } from '@/lib/seo';
import { waLink } from '@/lib/whatsapp';

type Props = { params: { slug: string } };

// Static build: every page is pre-built. Server build: rendered on first visit, refreshed every 30 s.
export const generateStaticParams = () => staticParams('branches');

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const [site, branch] = await Promise.all([getSite(), getBranch(params.slug)]);
  if (!branch) return {};
  const title = `Tattoo Studio in ${branch.name}, ${branch.address.region}`;
  return {
    title,
    description: `${site.studio.name} ${branch.name}: ${branch.intro} ${branch.address.street}, open ${branch.hours}. Book on WhatsApp.`,
    alternates: { canonical: `/studios/${branch.id}` },
    openGraph: { title, url: `/studios/${branch.id}` },
  };
}

export default async function StudioPage({ params }: Props) {
  const [site, branch] = await Promise.all([getSite(), getBranch(params.slug)]);
  if (!branch) notFound();
  const { studio, branches, artists, styles } = site;
  const team = artists.filter((a) => a.branch === branch.id);
  const works = site.gallery.filter((w) => team.some((a) => a.id === w.artist));
  const crumbs = [{ name: 'Home', path: '/' }, { name: 'Studios', path: '/studios' }, { name: branch.name, path: `/studios/${branch.id}` }];

  return (
    <>
      <PageHero
        eyebrow={`${studio.name} · ${branch.badge}`}
        title={`Tattoo studio in ${branch.name}`}
        intro={branch.intro}
        crumbs={crumbs}
        facts={[branch.hours, `${team.length} artist${team.length === 1 ? '' : 's'}`, 'Walk-ins welcome']}
        motif="gunungan"
      >
        <address className="muted">{branch.address.street}, {branch.address.locality}, {branch.address.region} {branch.address.postalCode}</address>
        <div className="ctas">
          <a className="btn btn-sogan" href={waLink(branch.whatsapp, `Hi ${studio.name} ${branch.name}! I'd like to book a tattoo.`)} target="_blank" rel="noopener">
            WhatsApp {branch.name}
          </a>
          <a className="btn btn-line" href={branch.mapsUrl} target="_blank" rel="noopener">Get directions</a>
        </div>
      </PageHero>

      {team.length > 0 && (
        <section className="section on-dark" aria-labelledby="team-title">
          <div className="wrap">
            <SectionHead label="The team" title={`Artists at ${branch.name}`} id="team-title" />
            <ArtistCards artists={team} branches={branches} studioName={studio.name} />
          </div>
        </section>
      )}

      {works.length > 0 && (
        <section className="section" id="work" aria-labelledby="work-title">
          <div className="wrap">
            <SectionHead label="Portfolio" title={`Recent work from ${branch.name}`} id="work-title" />
            <Gallery works={works} styles={styles} artists={artists} branches={branches} studioName={studio.name} />
          </div>
        </section>
      )}

      <BookingForm studio={studio} branches={branches} artists={artists} styles={styles} defaults={{ branch: branch.id }} />
      <FaqSection faqs={site.faqs} />

      {branches.length > 1 && (
        <section className="section alt" aria-labelledby="other-studios">
          <div className="wrap">
            <SectionHead label="Visit us" title="Our other studios" id="other-studios" />
            <BranchCards branches={branches.filter((b) => b.id !== branch.id)} studioName={studio.name} />
          </div>
        </section>
      )}

      <CtaPanel />
      <JsonLd data={parlorLd(studio, branch)} />
      <JsonLd data={breadcrumbLd(crumbs)} />
    </>
  );
}
