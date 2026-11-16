'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Artist, Branch, Style, Work } from '@/lib/types';
import { designMessage, waLink } from '@/lib/whatsapp';
import { ArtTile, TONES } from './Art';
import { PREFILL_EVENT, type Prefill } from './BookingForm';

type Props = {
  works: Work[];
  styles: Style[];
  artists: Artist[];
  branches: Branch[];
  studioName: string;
  showStyleFilter?: boolean;
  showArtistFilter?: boolean;
};

export function Gallery({ works, styles, artists, branches, studioName, showStyleFilter = true, showArtistFilter = true }: Props) {
  const [style, setStyle] = useState('all');
  const [artist, setArtist] = useState('all');
  const [active, setActive] = useState<Work | null>(null);
  const [origin, setOrigin] = useState('');
  const lastFocus = useRef<HTMLElement | null>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);

  useEffect(() => setOrigin(window.location.origin), []);

  const styleOf = (id: string) => styles.find((s) => s.id === id);
  const artistOf = (id: string) => artists.find((a) => a.id === id);
  const branchOf = (id?: string) => branches.find((b) => b.id === id);

  // Only offer filters that have work behind them.
  const usedStyles = useMemo(() => styles.filter((s) => works.some((w) => w.style === s.id)), [styles, works]);
  const usedArtists = useMemo(() => artists.filter((a) => works.some((w) => w.artist === a.id)), [artists, works]);
  const visible = works.filter((w) => (style === 'all' || w.style === style) && (artist === 'all' || w.artist === artist));

  useEffect(() => {
    if (!active) return;
    document.body.style.overflow = 'hidden';
    closeBtn.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
    };
  }, [active]);

  function open(w: Work, el: HTMLElement) {
    lastFocus.current = el;
    setActive(w);
  }
  function close() {
    setActive(null);
    lastFocus.current?.focus();
  }
  function customise(w: Work) {
    const a = artistOf(w.artist);
    const detail: Prefill = { branch: a?.branch, artist: w.artist, style: w.style, placement: w.placement, size: w.size, design: w.id };
    setActive(null);
    window.dispatchEvent(new CustomEvent(PREFILL_EVENT, { detail }));
    document.getElementById('book')?.scrollIntoView({ behavior: 'smooth' });
  }

  const chip = (pressed: boolean, label: string, onClick: () => void) => (
    <button key={label} type="button" className="chip" aria-pressed={pressed} onClick={onClick}>{label}</button>
  );

  return (
    <>
      {showStyleFilter && usedStyles.length > 1 && (
        <div className="filters" role="group" aria-label="Filter by style">
          {chip(style === 'all', 'All styles', () => setStyle('all'))}
          {usedStyles.map((s) => chip(style === s.id, s.name, () => setStyle(s.id)))}
        </div>
      )}
      {showArtistFilter && usedArtists.length > 1 && (
        <div className="filters filters-sub" role="group" aria-label="Filter by artist">
          {chip(artist === 'all', 'All artists', () => setArtist('all'))}
          {usedArtists.map((a) => chip(artist === a.id, a.name, () => setArtist(a.id)))}
        </div>
      )}

      <ul className="gallery" role="list">
        {visible.map((w) => {
          const s = styleOf(w.style), a = artistOf(w.artist);
          const idx = works.indexOf(w);
          return (
            <li key={w.id} style={{ display: 'contents' }}>
              <button type="button" className="work" onClick={(e) => open(w, e.currentTarget)} aria-label={`${s?.name} tattoo by ${a?.name}, ${w.placement} — view and book`}>
                <ArtTile motif={w.motif} tone={TONES[idx % TONES.length]} image={w.image} alt={`${s?.name} tattoo on ${w.placement.toLowerCase()} by ${a?.name}`} />
                <span className="work-caption"><span>{s?.name} · {a?.name}</span><span className="arrow" aria-hidden="true">↗</span></span>
              </button>
            </li>
          );
        })}
      </ul>
      {visible.length === 0 && <p className="empty">No pieces match this filter yet.</p>}

      {active && (() => {
        const s = styleOf(active.style), a = artistOf(active.artist), b = branchOf(a?.branch);
        const idx = works.indexOf(active);
        return (
          <div className="lightbox" role="dialog" aria-modal="true" aria-labelledby="lb-title" onClick={(e) => e.target === e.currentTarget && close()}>
            <div className="lb-card">
              <button ref={closeBtn} className="lb-close" aria-label="Close" onClick={close}>✕</button>
              <div className="lb-media">
                <ArtTile motif={active.motif} tone={TONES[idx % TONES.length]} image={active.image} alt={`${s?.name} tattoo`} />
              </div>
              <div className="lb-info">
                <p className="label">{s?.name}</p>
                <h3 id="lb-title">Design {active.id}</h3>
                <dl className="lb-meta">
                  <dt>Artist</dt><dd>{a?.name} — {a?.role}</dd>
                  <dt>Studio</dt><dd>{b?.name}</dd>
                  <dt>Placement</dt><dd>{active.placement}</dd>
                  <dt>Size</dt><dd>{active.size}</dd>
                </dl>
                {b && (
                  <a className="btn btn-sogan" href={waLink(b.whatsapp, designMessage(studioName, active, s, a, b, origin))} target="_blank" rel="noopener">
                    Book this design on WhatsApp
                  </a>
                )}
                <button type="button" className="btn btn-line" onClick={() => customise(active)}>Customise in booking form</button>
              </div>
            </div>
          </div>
        );
      })()}
    </>
  );
}
