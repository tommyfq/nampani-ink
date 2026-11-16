import { ImageResponse } from 'next/og';
import { getSite } from '@/lib/api';

/** Share image for WhatsApp, Facebook, X etc. (1200×630), generated from the studio name. */
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Tattoo studio';

export default async function OgImage() {
  const { studio, branches } = await getSite();
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
          padding: 80, background: '#F1EADB', color: '#4A2E1F',
        }}
      >
        <div style={{ fontSize: 26, letterSpacing: 6, textTransform: 'uppercase', opacity: 0.7 }}>{studio.tagline}</div>
        <div style={{ fontSize: 96, marginTop: 20, letterSpacing: -2 }}>{studio.name}</div>
        <div style={{ display: 'flex', fontSize: 34, marginTop: 24, opacity: 0.8 }}>
          {`${branches.map((b) => b.name).join(' · ')} — ${studio.city}`}
        </div>
      </div>
    ),
    size,
  );
}
