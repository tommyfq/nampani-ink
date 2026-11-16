import Link from 'next/link';
import type { ReactNode } from 'react';
import type { Accent, Artist, Branch, Faq, PrepTip, Review, SiteContent, Style, Studio } from '@/lib/types';
import { waLink } from '@/lib/whatsapp';
import { Art, ArtTile, TONES, VineDivider } from './Art';

/* ==========================================================================
   Building blocks
   ========================================================================== */

/** A word in Javanese script with its Latin reading. Decorative: screen readers get the Latin. */
export function Jv({ accent, center }: { accent?: Accent; center?: boolean }) {
  if (!accent) return null;
  return (
    <span className={`jv${center ? ' center' : ''}`}>
      <span className="jv-script" lang="jv" aria-hidden="true">{accent.jv}</span>
      <span className="jv-latin">{accent.latin} · {accent.meaning}</span>
    </span>
  );
}

export function SectionHead({ label, title, intro, accent, children, id }: {
  label: string; title: ReactNode; intro?: string; accent?: Accent; children?: ReactNode; id?: string;
}) {
  return (
    <div className="section-head" data-reveal>
      <div>
        <p className="label">{label}</p>
        <div className="title-row" style={{ marginTop: 12 }}>
          <h2 id={id}>{title}</h2>
          <Jv accent={accent} />
        </div>
      </div>
      {intro && <p className="section-intro">{intro}</p>}
      {children}
    </div>
  );
}

/** Light header for style, artist and studio pages. Holds the page's single <h1>. */
export function PageHero({ eyebrow, title, intro, crumbs, facts, motif, children }: {
  eyebrow: string; title: string; intro: string; crumbs: { name: string; path: string }[];
  facts?: string[]; motif: string; children?: ReactNode;
}) {
  return (
    <section className="page-hero" aria-labelledby="page-title">
      <Art motif={motif} className="hero-art" />
      <div className="wrap">
        <div className="content">
          <nav aria-label="Breadcrumb">
            <ol className="breadcrumbs">
              {crumbs.map((c, i) => (
                <li key={c.path}>
                  {i < crumbs.length - 1 ? <Link href={c.path}>{c.name}</Link> : <span aria-current="page">{c.name}</span>}
                </li>
              ))}
            </ol>
          </nav>
          <p className="label">{eyebrow}</p>
          <h1 id="page-title">{title}</h1>
          <p className="sub">{intro}</p>
          {facts && facts.length > 0 && <p className="facts">{facts.map((f) => <span key={f}>{f}</span>)}</p>}
          {children}
        </div>
      </div>
    </section>
  );
}

/* ==========================================================================
   Home page sections (in page order)
   ========================================================================== */

/** 1 — First screen: giant wordmark, one line, Javanese accent, request button. */
export function Intro({ studio, branches, accent }: { studio: Studio; branches: Branch[]; accent?: Accent }) {
  return (
    <section className="intro" aria-labelledby="intro-title">
      <Art motif="gunungan" className="intro-ornament" />
      <Art motif="lung" className="intro-ornament right" />
      <div className="intro-center">
        <p className="intro-line">A mark you receive — and keep for life. Fine line tattoos drawn like batik tulis, one line at a time.</p>
        <Jv accent={accent} center />
        <a href="#book" className="btn btn-sogan">Send request</a>
      </div>
      <div className="intro-bottom">
        <h1 id="intro-title" className="wordmark">
          <span>{studio.name.split(' ')[0]}</span>
          <span>{studio.name.split(' ').slice(1).join(' ') || 'Ink'}</span>
          <span className="sr-only"> — fine line tattoo studio in {studio.city}</span>
        </h1>
        <p className="intro-meta">
          Fine line tattoo studios<br />
          {branches.map((b) => b.name).join(' · ')}, {studio.city}
        </p>
      </div>
    </section>
  );
}

/** 2 — Feature card: the Nusantara collection. */
export function Feature({ styleHref }: { styleHref: string }) {
  return (
    <section className="section tight" aria-labelledby="feature-title">
      <div className="wrap">
        <div className="feature" data-reveal>
          <div className="feature-text">
            <p className="label">Nusantara collection</p>
            <h2 id="feature-title">Javanese craft, drawn in fine line</h2>
            <p>Batik vines and isen-isen dots, the wayang gunungan, names in Aksara Jawa. Heritage motifs redrawn as delicate single-needle work — with their meaning explained before we start.</p>
            <Link href={styleHref} className="btn btn-line">See the collection</Link>
          </div>
          <ArtTile motif="lung" tone="sogan" />
        </div>
      </div>
    </section>
  );
}

/** 3 — About the studio. */
export function About({ studio, branchCount }: { studio: Studio; branchCount: number }) {
  return (
    <section className="section about" id="about" aria-labelledby="about-title">
      <div className="wrap" data-reveal>
        <p className="label">About us</p>
        <div className="about-portrait" style={{ marginTop: 28 }}>
          <GebyokFrame />
          <ArtTile motif="truntum" tone="mori" />
        </div>
        <h2 id="about-title">Hello, we&apos;re {studio.name}.</h2>
        <p className="about-sub" style={{ fontFamily: 'var(--f-serif)', fontStyle: 'italic', fontSize: 'clamp(22px, 2.4vw, 30px)', color: 'var(--sogan)', marginTop: 10 }}>
          A mark you receive, and keep.
        </p>
        <div className="about-cols">
          <p>
            <em>Nampani</em> comes from the Javanese for &ldquo;to receive&rdquo;. A tattoo is something you receive — from an artist,
            at a moment in your life — and carry with you for good. We started in {studio.established} and now welcome you at {branchCount} studios across {studio.city}.
          </p>
          <p>
            We draw every piece by hand, the way batik tulis is drawn with a canting: slowly, one line at a time. Fine line,
            micro realism and Nusantara designs, priced per design from {studio.priceFrom}, with one free touch-up after healing.
          </p>
        </div>
      </div>
    </section>
  );
}

/** Giant background word with a Javanese accent, as in the reference layout. */
export function GiantWord({ word, accent }: { word: string; accent?: Accent }) {
  return (
    <div className="giant" aria-hidden="true">
      <span className="giant-word">{word}</span>
      <Jv accent={accent} />
    </div>
  );
}

export function Quote({ children }: { children: ReactNode }) {
  return (
    <div className="quote" data-reveal>
      <Art motif="lung" />
      <p>{children}</p>
    </div>
  );
}

/** 6 — Approach: photo panel + values. */
export function Approach({ accent }: { accent?: Accent }) {
  const values = [
    ['Drawn for you', 'No flash copied off the wall. Your artist draws the design for your body and placement.'],
    ['Priced per design', 'A fixed quote once the drawing is agreed — never by the hour, so care never costs extra.'],
    ['Clean, always', 'Single-use needles and cartridges, opened in front of you, in private rooms.'],
    ['Here after healing', 'One free touch-up after four to six weeks, at any of our studios.'],
  ];
  return (
    <section className="section" id="approach" aria-labelledby="approach-title">
      <div className="wrap approach">
        <div className="approach-media" data-reveal>
          <ArtTile motif="gunungan" tone="sand" />
        </div>
        <div data-reveal>
          <p className="label">Our approach</p>
          <div className="title-row" style={{ marginTop: 14 }}>
            <h2 id="approach-title">Care and <em>attention</em>, for you</h2>
            <Jv accent={accent} />
          </div>
          <div className="values">
            {values.map(([t, d]) => (
              <div key={t}><h3>{t}</h3><p>{d}</p></div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/** 7 — Reviews as message cards. */
export function Reviews({ reviews, studio }: { reviews: Review[]; studio: Studio }) {
  return (
    <section className="section on-dark" id="reviews" aria-labelledby="reviews-title">
      <div className="wrap">
        <div className="reviews-head" data-reveal>
          <div>
            <p className="label">Reviews</p>
            <h2 id="reviews-title" className="reviews-title" style={{ marginTop: 14 }}>
              <span>Your</span><span className="soft">words</span>
            </h2>
          </div>
          <div className="rating">
            <strong>{studio.rating.score.toFixed(1)}</strong>
            <span>
              <span className="stars" aria-hidden="true">★★★★★</span><br />
              <span style={{ color: 'var(--on-dark-muted)', fontSize: 14 }}>Based on {studio.rating.count}+ {studio.rating.source} reviews</span>
            </span>
          </div>
        </div>
        <div className="reviews">
          {reviews.map((r, i) => (
            <article key={i} className="review" data-reveal>
              <span className="stars" aria-label="5 out of 5">★★★★★</span>
              <p>{r.text}</p>
              <footer>{r.name} · tattooed by {r.artist}</footer>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

/** 8 — Before your session: horizontal cards. */
export function Prep({ tips }: { tips: PrepTip[] }) {
  const cards: ReactNode[] = [];
  tips.forEach((t, i) => {
    cards.push(
      <article key={t.title} className="prep-card">
        <h3>{t.title}</h3>
        <p>{t.text}</p>
      </article>,
    );
    if (i === 1) cards.push(<div key="art" className="prep-card art" aria-hidden="true"><Art motif="truntum" /></div>);
  });
  return (
    <section className="section alt" id="prep" aria-labelledby="prep-title">
      <div className="wrap">
        <div className="prep-head" data-reveal>
          <div>
            <p className="label">Before your session</p>
            <h2 id="prep-title" style={{ marginTop: 10 }}>Take care of yourself</h2>
          </div>
          <p className="muted" style={{ maxWidth: '40ch' }}>A few simple steps make the session easier and the tattoo heal better.</p>
        </div>
        <div className="prep-row" tabIndex={0} aria-label="Preparation tips, scroll sideways">{cards}</div>
      </div>
    </section>
  );
}

/** 9 — Studios intro + branch cards. */
export function Studios({ studio, branches, accent }: { studio: Studio; branches: Branch[]; accent?: Accent }) {
  return (
    <section className="section" id="studios" aria-labelledby="studios-title">
      <div className="wrap">
        <p className="label" data-reveal>Studios</p>
        <div className="studios-intro" data-reveal style={{ marginTop: 14 }}>
          <div>
            <h2 id="studios-title" className="lead">{branches.length} studios across {studio.city} — same standard, same prices, same hands.</h2>
            <div style={{ marginTop: 18 }}><Jv accent={accent} /></div>
          </div>
          <p className="muted">{studio.hoursNote}. Every studio has its own WhatsApp, so you talk directly to the team where you&apos;ll be tattooed. Book whichever is closest — artists rotate between them.</p>
        </div>
        <BranchCards branches={branches} studioName={studio.name} />
      </div>
    </section>
  );
}

/** 12 — Closing: the gunungan ends the story, as it does in wayang. Also used on sub-pages. */
export function CtaPanel({ studio }: { studio?: Studio }) {
  return (
    <section className="section on-dark closing" aria-labelledby="cta-title">
      <div className="wrap" data-reveal>
        <Art motif="gunungan" className="gunungan" />
        <h2 id="cta-title">Come and receive <em>your mark</em></h2>
        <p>Tell us what you&apos;re carrying and where you want it. We&apos;ll draw it, quote it once, and hold the room for you.</p>
        <div className="ctas">
          <a href="#book" className="btn btn-light">Send request</a>
          <Link href="/#work" className="btn btn-ghost">Browse the work</Link>
        </div>
        {studio && (
          <div className="contacts-row">
            <div><span>WhatsApp</span><a href={waLink(studio.whatsapp, `Hi ${studio.name}!`)} target="_blank" rel="noopener">+{studio.whatsapp}</a></div>
            <div><span>Email</span><a href={`mailto:${studio.email}`}>{studio.email}</a></div>
            {studio.social.instagram && <div><span>Instagram</span><a href={studio.social.instagram} target="_blank" rel="noopener me">Follow our work</a></div>}
          </div>
        )}
      </div>
    </section>
  );
}

/* ==========================================================================
   Shared cards (home + sub-pages)
   ========================================================================== */

/** Carved gebyok screen drawn around a portrait. */
function GebyokFrame() {
  return (
    <svg className="art-svg frame" viewBox="0 0 100 125" preserveAspectRatio="none" aria-hidden="true">
      <rect x="0.5" y="0.5" width="99" height="124" vectorEffect="non-scaling-stroke" />
      <path d="M6 124 V46 C6 8 94 8 94 46 V124" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function StyleCards({ styles }: { styles: Style[] }) {
  return (
    <div className="styles-grid">
      {styles.map((s, i) => (
        <Link key={s.id} href={`/styles/${s.id}`} className="style-card" data-reveal>
          <ArtTile motif={s.motif} tone={TONES[i % TONES.length]} image={s.image} alt={`${s.name} tattoo`} />
          <span className="meta">
            <span className="name">{s.name}</span>
            {s.badge && <span className="badge">{s.badge}</span>}
          </span>
        </Link>
      ))}
    </div>
  );
}

export function ArtistCards({ artists, branches, studioName }: { artists: Artist[]; branches: Branch[]; studioName: string }) {
  return (
    <div className="artists">
      {artists.map((a, i) => {
        const b = branches.find((x) => x.id === a.branch);
        const msg = `Hi ${studioName}! I'd like to book a session with ${a.name}${b ? ` at ${b.name}` : ''}.\n\nMy idea: `;
        return (
          <article key={a.id} className="artist" data-reveal>
            <div className="artist-frame">
              <GebyokFrame />
              <ArtTile motif={a.motif} tone={(['sogan', 'sand', 'mori'] as const)[i % 3]} image={a.photo} alt={`${a.name}, tattoo artist`} />
            </div>
            <span className="artist-role">{a.role}</span>
            <h3><Link href={`/artists/${a.id}`}>{a.name}</Link></h3>
            <p>{a.bio}</p>
            <div className="artist-foot">
              <span>{b?.name} · {a.years} yrs</span>
              {b && <a href={waLink(b.whatsapp, msg)} target="_blank" rel="noopener">Book with {a.name} ›</a>}
            </div>
          </article>
        );
      })}
    </div>
  );
}

export function BranchCards({ branches, studioName }: { branches: Branch[]; studioName: string }) {
  const motifs = ['gunungan', 'truntum', 'lung'];
  return (
    <div className="branches">
      {branches.map((b, i) => (
        <article key={b.id} className="branch" data-reveal>
          <ArtTile motif={motifs[i % motifs.length]} tone={(['mori', 'sand', 'sogan'] as const)[i % 3]} />
          <span className="tag">{b.badge}</span>
          <h3><Link href={`/studios/${b.id}`}>{b.name}</Link></h3>
          <p>{b.area} · {b.hours}</p>
          <address className="addr">{b.address.street}, {b.address.locality}, {b.address.region}</address>
          <div className="links">
            <a className="link-arrow" href={waLink(b.whatsapp, `Hi ${studioName} ${b.name}! I'd like to book a tattoo.`)} target="_blank" rel="noopener">WhatsApp ↗</a>
            <a className="link-arrow" href={b.mapsUrl} target="_blank" rel="noopener">Directions ↗</a>
          </div>
        </article>
      ))}
    </div>
  );
}

export function FaqSection({ faqs }: { faqs: Faq[] }) {
  return (
    <section className="section" id="faq" aria-labelledby="faq-title">
      <div className="wrap">
        <SectionHead label="Good to know" title="Frequently asked questions" id="faq-title" />
        <div className="faq-list">
          {faqs.map((f, i) => (
            <details key={f.q} className="faq-item" open={i === 0}>
              <summary><h3>{f.q}</h3></summary>
              <p>{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

export { VineDivider };

export function nusantaraHref(site: SiteContent) {
  const s = site.styles.find((x) => x.badge === 'Nusantara');
  return s ? `/styles/${s.id}` : '/styles';
}
