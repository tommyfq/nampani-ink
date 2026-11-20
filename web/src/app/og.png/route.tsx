import { ImageResponse } from 'next/og';
import { getSite } from '@/lib/api';

/**
 * /og.png — share image for WhatsApp, Facebook, X etc. (1200×630), generated from
 * the studio name. Linked explicitly in layout metadata so the address is right
 * both on the Docker server and on GitHub Pages (under /nampani-ink).
 */
export async function GET() {
  const { studio, branches } = await getSite();
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
          padding: 80, background: '#F1EADB', color: '#665744',
        }}
      >
        <div style={{ fontSize: 26, letterSpacing: 6, textTransform: 'uppercase', opacity: 0.7 }}>{studio.tagline}</div>
        <div style={{ fontSize: 96, marginTop: 20, letterSpacing: -2 }}>{studio.name}</div>
        <div style={{ display: 'flex', fontSize: 34, marginTop: 24, opacity: 0.8 }}>
          {`${branches.map((b) => b.name).join(' · ')} — ${studio.city}`}
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
