'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

const LINKS = [
  { href: '/#about', label: 'About' },
  { href: '/#work', label: 'Work' },
  { href: '/#artists', label: 'Artists' },
  { href: '/#approach', label: 'Approach' },
  { href: '/#reviews', label: 'Reviews' },
  { href: '/#prep', label: 'Before your session' },
  { href: '/#studios', label: 'Studios' },
];

export function Header({ studioName, hoursNote, waHref }: { studioName: string; hoursNote: string; waHref: string }) {
  const [open, setOpen] = useState(false);
  const openBtn = useRef<HTMLButtonElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    if (open) closeBtn.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const close = () => {
    setOpen(false);
    openBtn.current?.focus();
  };

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <Link href="/" className="topbar-logo" aria-label={`${studioName} — home`}>
            {studioName.toUpperCase()}
          </Link>
          <nav className="topbar-nav" aria-label="Main">
            {LINKS.map((l) => (
              <Link key={l.href} href={l.href}>{l.label}</Link>
            ))}
          </nav>
          <a href="#book" className="topbar-cta">Send request</a>
          <button ref={openBtn} className="menu-btn" aria-label="Open menu" aria-expanded={open} aria-controls="menu" onClick={() => setOpen(true)}>
            <span className="burger" />
            <span>Menu</span>
          </button>
        </div>
      </header>

      <nav className={`menu${open ? ' open' : ''}`} id="menu" aria-label="Mobile" aria-hidden={!open}>
        <div className="menu-inner">
          <button ref={closeBtn} className="menu-close" onClick={close} tabIndex={open ? 0 : -1}>
            Close ✕
          </button>
          <ul className="menu-links">
            {[...LINKS, { href: '#book', label: 'Send request' }].map((l) => (
              <li key={l.href}>
                <Link href={l.href} onClick={close} tabIndex={open ? 0 : -1}>{l.label}</Link>
              </li>
            ))}
          </ul>
          <div className="menu-foot">
            <span>{hoursNote}</span>
            <a className="btn btn-ghost" href={waHref} target="_blank" rel="noopener" tabIndex={open ? 0 : -1}>
              Chat on WhatsApp
            </a>
          </div>
        </div>
      </nav>
    </>
  );
}
