'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

/**
 * Gentle fade-in for elements marked `data-reveal`. Content is fully visible
 * without JavaScript (and to search engines); the hidden start state only
 * applies once this script adds `reveal-ready` to <html>.
 */
export function Reveal() {
  const pathname = usePathname(); // re-run after client-side page changes
  useEffect(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>('[data-reveal]:not(.is-visible)'));
    if (!('IntersectionObserver' in window) || !els.length) return;
    document.documentElement.classList.add('reveal-ready');
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add('is-visible');
            io.unobserve(e.target);
          }
        }
      },
      { rootMargin: '0px 0px -10% 0px', threshold: 0.05 },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [pathname]);
  return null;
}
