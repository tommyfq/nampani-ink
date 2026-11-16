import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BookingForm } from '@/components/BookingForm';
import { Gallery } from '@/components/Gallery';
import { JsonLd } from '@/components/JsonLd';
import { ArtistCards, CtaPanel, PageHero, SectionHead } from '@/components/Sections';
import { getArtist, getSite, staticParams } from '@/lib/api';
import { breadcrumbLd, personLd } from '@/lib/seo';
import { waLink } from '@/lib/whatsapp';

type Props = { params: { slug: string } };

// Static build: every page is pre-built. Server build: rendered on first visit, refreshed every 30 s.
export const generateStaticParams = () => staticParams('artists');

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const [site, artist] = await Promise.all([getSite(), getArtist(params.slug)]);
  if (!artist) return {};
  const branch = site.branches.find((b) => b.id === artist.branch);
  const title = `${artist.name} — ${artist.role} Tattoo Artist${branch ? ` in ${branch.name}` : ''}`;
  return {
    title,
    description: `${artist.bio} ${artist.years} years tattooing at ${site.studio.name}${branch ? ` ${branch.name}` : ''}. View portfolio and book on WhatsApp.`,
    alternates: { canonical: `/artists/${artist.id}` },
    openGraph: { title, url: `/artists/${artist.id}`, type: 'profile' },
  };
}

export default async function ArtistPage({ params }: Props) {
  const [site, artist] = await Promise.all([getSite(), getArtist(params.slug)]);
  if (!artist) notFound();
  const { studio, branches, artists, styles } = site;
  const branch = branches.find((b) => b.id === artist.branch);
  const works = site.gallery.filter((w) => w.artist === artist.id);
  const specialtyNames = artist.specialties.map((id) => styles.find((s) => s.id === id)?.name).filter((n): n is string => !!n);
  const crumbs = [{ name: 'Home', path: '/' }, { name: 'Artists', path: '/artists' }, { name: artist.name, path: `/artists/${artist.id}` }];

  return (
    <>
      <PageHero
        eyebrow={`Tattoo artist · ${artist.role}`}
        title={artist.name}
        intro={artist.bio}
        crumbs={crumbs}
        facts={[`${artist.years} years tattooing`, ...(branch ? [`${branch.name} studio`] : []), ...specialtyNames]}
        motif={artist.motif}
      >
        <div className="ctas">
          {branch && (
            <a className="btn btn-sogan" href={waLink(branch.whatsapp, `Hi ${studio.name}! I'd like to book a session with ${artist.name} at ${branch.name}.\n\nMy idea: `)} target="_blank" rel="noopener">
              Book with {artist.name}
            </a>
          )}
          {branch && <Link href={`/studios/${branch.id}`} className="btn btn-line">Visit the {branch.name} studio</Link>}
        </div>
      </PageHero>

      <section className="section" id="work" aria-labelledby="work-title">
        <div className="wrap">
          <SectionHead label="Portfolio" title={`Recent work by ${artist.name}`} id="work-title" />
          <Gallery works={works} styles={styles} artists={artists} branches={branches} studioName={studio.name} showArtistFilter={false} />
        </div>
      </section>

      <BookingForm studio={studio} branches={branches} artists={artists} styles={styles} defaults={{ branch: artist.branch, artist: artist.id }} />

      <section className="section on-dark" aria-labelledby="others-title">
        <div className="wrap">
          <SectionHead label="The team" title="Other artists" id="others-title" />
          <ArtistCards artists={artists.filter((a) => a.id !== artist.id)} branches={branches} studioName={studio.name} />
        </div>
      </section>

      <CtaPanel />
      <JsonLd data={personLd(studio, artist, branch)} />
      <JsonLd data={breadcrumbLd(crumbs)} />
    </>
  );
}
