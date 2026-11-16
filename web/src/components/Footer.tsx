import Link from 'next/link';
import type { SiteContent } from '@/lib/types';
import { waLink } from '@/lib/whatsapp';

export function Footer({ site }: { site: SiteContent }) {
  const { studio } = site;
  return (
    <footer className="footer">
      <div className="wrap">
      <div className="footer-grid">
        <nav aria-label="Tattoo styles">
          <h2 className="footer-h">Tattoo styles</h2>
          <ul>
            {site.styles.map((s) => (
              <li key={s.id}>
                <Link href={`/styles/${s.id}`}>{s.name}</Link>
              </li>
            ))}
          </ul>
        </nav>
        <nav aria-label="Studios">
          <h2 className="footer-h">Visit</h2>
          <ul>
            {site.branches.map((b) => (
              <li key={b.id} className="branch-line">
                <Link href={`/studios/${b.id}`}>
                  Tattoo studio in {b.name} · {b.hours}
                </Link>
                <address>
                  <small>
                    {b.address.street}, {b.address.locality}, {b.address.region}
                  </small>
                </address>
              </li>
            ))}
          </ul>
        </nav>
        <nav aria-label="Artists">
          <h2 className="footer-h">Artists</h2>
          <ul>
            {site.artists.map((a) => (
              <li key={a.id}>
                <Link href={`/artists/${a.id}`}>
                  {a.name} — {a.role}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div>
          <h2 className="footer-h">Follow & contact</h2>
          <ul>
            {Object.entries(studio.social).map(([name, url]) => (
              <li key={name}>
                <a href={url} target="_blank" rel="noopener me">
                  {name[0].toUpperCase() + name.slice(1)}
                </a>
              </li>
            ))}
            <li>
              <a href={waLink(studio.whatsapp, `Hi ${studio.name}!`)} target="_blank" rel="noopener">
                WhatsApp
              </a>
            </li>
            <li>
              <a href={`mailto:${studio.email}`}>{studio.email}</a>
            </li>
          </ul>
        </div>
      </div>
      <p className="areas">
        <span>Reach us from nearby:</span> <span>{studio.nearbyAreas.join(' · ')}</span>
      </p>
      <div className="footer-bottom">
        <span className="footer-logo">{studio.name}</span>
        <span>
          © {new Date().getFullYear()} {studio.name} · Art to your skin
        </span>
      </div>
      </div>
    </footer>
  );
}
