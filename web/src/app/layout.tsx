import type { Metadata, Viewport } from 'next';
import { Cormorant_Garamond, Inter_Tight, Noto_Sans_Javanese } from 'next/font/google';
import { Footer } from '@/components/Footer';
import { Header } from '@/components/Header';
import { JsonLd } from '@/components/JsonLd';
import { Reveal } from '@/components/Reveal';
import { getSite } from '@/lib/api';
import { abs, organizationLd, siteUrl, websiteLd } from '@/lib/seo';
import { waLink } from '@/lib/whatsapp';
import './globals.css';


const sans = Inter_Tight({ subsets: ['latin'], weight: ['300', '400', '500'], variable: '--font-sans', display: 'swap' });
const serif = Cormorant_Garamond({ subsets: ['latin'], weight: ['400', '500'], style: ['normal', 'italic'], variable: '--font-serif', display: 'swap' });
// Javanese script, used only for decorative accent words.
const javanese = Noto_Sans_Javanese({ subsets: ['javanese'], weight: ['400'], variable: '--font-jv', display: 'swap', preload: false });

export async function generateMetadata(): Promise<Metadata> {
  const { studio } = await getSite();
  const title = `${studio.name} — Fine Line & Nusantara Tattoo Studio in ${studio.city}`;
  return {
    metadataBase: new URL(siteUrl()),
    title: { default: title, template: `%s | ${studio.name}` },
    description: studio.description,
    applicationName: studio.name,
    keywords: ['tattoo studio', `tattoo ${studio.city}`, 'fine line tattoo', 'batik tattoo', 'wayang tattoo', 'aksara jawa tattoo', 'micro realism tattoo', `${studio.city} tattoo artist`],
    alternates: { canonical: '/' },
    openGraph: {
      type: 'website', siteName: studio.name, title, description: studio.description, url: '/', locale: 'en_US',
      images: [{ url: abs('/og.png'), width: 1200, height: 630, alt: studio.name }],
    },
    twitter: { card: 'summary_large_image', title, description: studio.description, images: [abs('/og.png')] },
    robots: { index: true, follow: true },
    formatDetection: { telephone: false },
  };
}

export const viewport: Viewport = {
  themeColor: '#f1eadb',
  width: 'device-width',
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const site = await getSite();
  const { studio } = site;
  const waGeneral = waLink(studio.whatsapp, `Hi ${studio.name}! I'd like to ask about a tattoo.`);

  return (
    <html lang="en" className={`${sans.variable} ${serif.variable} ${javanese.variable}`}>
      <body>
        <a href="#main" className="sr-only skip">Skip to content</a>
        <Header studioName={studio.name} hoursNote={studio.hoursNote} waHref={waGeneral} />
        <main id="main">{children}</main>
        <Footer site={site} />

        <a className="wa-float" href={waGeneral} target="_blank" rel="noopener" aria-label="Chat on WhatsApp">
          <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 3a13 13 0 0 0-11.2 19.6L3 29l6.6-1.7A13 13 0 1 0 16 3Zm0 23.7a10.7 10.7 0 0 1-5.5-1.5l-.4-.2-3.9 1 1-3.8-.3-.4A10.7 10.7 0 1 1 16 26.7Zm5.9-8c-.3-.2-1.9-1-2.2-1.1-.3-.1-.5-.2-.7.2l-1 1.2c-.2.2-.4.2-.7.1a8.8 8.8 0 0 1-4.4-3.8c-.3-.6.3-.5.9-1.7.1-.2 0-.4 0-.5l-1-2.4c-.3-.6-.5-.5-.7-.5h-.6a1.2 1.2 0 0 0-.9.4 3.6 3.6 0 0 0-1.1 2.7 6.3 6.3 0 0 0 1.3 3.3 14.4 14.4 0 0 0 5.5 4.9c2 .9 2.8.9 3.9.8a3.3 3.3 0 0 0 2.1-1.5 2.7 2.7 0 0 0 .2-1.5c-.1-.2-.3-.3-.6-.4Z" /></svg>
        </a>
        <div className="mobile-bar">
          <a href="#book" className="btn btn-sogan">Send request ›</a>
        </div>
        <Reveal />

        <JsonLd data={organizationLd(site)} />
        <JsonLd data={websiteLd(studio)} />
      </body>
    </html>
  );
}
