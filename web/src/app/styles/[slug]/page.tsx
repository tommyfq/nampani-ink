import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { BookingForm } from '@/components/BookingForm';
import { Gallery } from '@/components/Gallery';
import { JsonLd } from '@/components/JsonLd';
import { ArtistCards, CtaPanel, PageHero, SectionHead, StyleCards } from '@/components/Sections';
import { getSite, getStyle, staticParams } from '@/lib/api';
import { breadcrumbLd } from '@/lib/seo';

type Props = { params: { slug: string } };

// Static build: every page is pre-built. Server build: rendered on first visit, refreshed every 30 s.
export const generateStaticParams = () => staticParams('styles');

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const [site, style] = await Promise.all([getSite(), getStyle(params.slug)]);
  if (!style) return {};
  const title = `${style.name} Tattoos in ${site.studio.city}`;
  return {
    title,
    description: `${style.description} See recent ${style.name.toLowerCase()} work and book with ${site.studio.name} on WhatsApp.`,
    alternates: { canonical: `/styles/${style.id}` },
    openGraph: { title, url: `/styles/${style.id}` },
  };
}

export default async function StylePage({ params }: Props) {
  const [site, style] = await Promise.all([getSite(), getStyle(params.slug)]);
  if (!style) notFound();
  const { studio, branches, artists, styles } = site;
  const works = site.gallery.filter((w) => w.style === style.id);
  const specialists = artists.filter((a) => a.specialties.includes(style.id));
  const crumbs = [{ name: 'Home', path: '/' }, { name: 'Tattoo styles', path: '/styles' }, { name: style.name, path: `/styles/${style.id}` }];

  return (
    <>
      <PageHero
        eyebrow={style.badge === 'Nusantara' ? 'Nusantara collection' : 'Tattoo style'}
        title={`${style.name} tattoos in ${studio.city}`}
        intro={style.description}
        crumbs={crumbs}
        facts={[`From ${studio.priceFrom}`, `${specialists.length} specialist artist${specialists.length === 1 ? '' : 's'}`, 'Free touch-up']}
        motif={style.motif}
      >
        <div className="ctas">
          <a href="#book" className="btn btn-sogan">Book a {style.name.toLowerCase()} tattoo</a>
          <a href="#work" className="btn btn-line">See the work</a>
        </div>
      </PageHero>

      <section className="section" id="work" aria-labelledby="work-title">
        <div className="wrap">
          <SectionHead label="Portfolio" title={`Recent ${style.name.toLowerCase()} work`} id="work-title"
            intro="Tap a piece to send it to WhatsApp, or customise it in the booking form below." />
          <Gallery works={works} styles={styles} artists={artists} branches={branches} studioName={studio.name} showStyleFilter={false} />
        </div>
      </section>

      {specialists.length > 0 && (
        <section className="section on-dark" aria-labelledby="specialists-title">
          <div className="wrap">
            <SectionHead label="Who to book" title={`${style.name} specialists`} id="specialists-title" />
            <ArtistCards artists={specialists} branches={branches} studioName={studio.name} />
          </div>
        </section>
      )}

      <BookingForm studio={studio} branches={branches} artists={artists} styles={styles} defaults={{ style: style.id }} />

      <section className="section" aria-labelledby="other-styles">
        <div className="wrap">
          <SectionHead label="Explore" title="Other tattoo styles" id="other-styles" />
          <StyleCards styles={styles.filter((s) => s.id !== style.id)} />
        </div>
      </section>

      <CtaPanel />
      <JsonLd data={breadcrumbLd(crumbs)} />
    </>
  );
}
