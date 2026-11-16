import { BookingForm } from '@/components/BookingForm';
import { Gallery } from '@/components/Gallery';
import { JsonLd } from '@/components/JsonLd';
import {
  About, Approach, ArtistCards, CtaPanel, FaqSection, Feature, GiantWord, Intro, Prep, Quote, Reviews,
  SectionHead, Studios, StyleCards, nusantaraHref,
} from '@/components/Sections';
import { getSite } from '@/lib/api';
import { faqLd, parlorLd } from '@/lib/seo';

/* Layout follows an editorial single-page flow:
   first screen → feature → about → work → artists → approach → reviews →
   before your session → studios → booking → FAQ → closing. */
export default async function HomePage() {
  const site = await getSite();
  const { studio, branches, styles, artists, gallery, accents } = site;

  return (
    <>
      <Intro studio={studio} branches={branches} accent={accents?.brand} />
      <Feature styleHref={nusantaraHref(site)} />
      <About studio={studio} branchCount={branches.length} />

      <section className="section" id="work" aria-labelledby="work-title" style={{ paddingTop: 0 }}>
        <div className="wrap">
          <SectionHead label="Portfolio" title="Recent work" id="work-title"
            intro="Tap a piece to send it straight to WhatsApp — your artist adapts it to your size and placement." />
          <Gallery works={gallery} styles={styles} artists={artists} branches={branches} studioName={studio.name} />
          {studio.social.instagram && (
            <div className="center"><a className="btn btn-line" href={studio.social.instagram} target="_blank" rel="noopener">More on Instagram</a></div>
          )}
          <GiantWord word="Karya" accent={accents?.work} />
          <div style={{ marginTop: 'clamp(48px, 7vw, 96px)' }}>
            <Quote>Every line is drawn for you, slowly — the way wax flows from a canting onto cloth.</Quote>
          </div>
        </div>
      </section>

      <section className="section alt" aria-labelledby="styles-title">
        <div className="wrap">
          <SectionHead label="Tattoo styles" title="Find the style that fits your story" id="styles-title"
            intro="Fine line is our signature. Explore the Nusantara collection or any style below to see recent work and who to book." />
          <StyleCards styles={styles} />
        </div>
      </section>

      <section className="section on-dark" id="artists" aria-labelledby="artists-title">
        <div className="wrap">
          <SectionHead label="Tattoo artists" title="Meet the artists" id="artists-title" accent={accents?.artists}
            intro="Each artist has a speciality. Book the person whose work you love, at the studio closest to you." />
          <ArtistCards artists={artists} branches={branches} studioName={studio.name} />
        </div>
      </section>

      <Approach accent={accents?.approach} />
      <Reviews reviews={site.reviews} studio={studio} />
      {site.prep?.length > 0 && <Prep tips={site.prep} />}
      <Studios studio={studio} branches={branches} accent={accents?.studios} />
      <BookingForm studio={studio} branches={branches} artists={artists} styles={styles} />
      <FaqSection faqs={site.faqs} />
      <CtaPanel studio={studio} />

      <JsonLd data={faqLd(site.faqs)} />
      {branches.map((b) => <JsonLd key={b.id} data={parlorLd(studio, b)} />)}
    </>
  );
}
