'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Icon, IconName } from '@/components/Icons';
import { LiveProvider, useLive } from '@/components/Live';
import { SessionProvider, useMe } from '@/components/Session';
import { api, Role } from '@/lib/api';

type Item = { href: string; label: string; icon: IconName; roles: Role[] };
const ALL: Role[] = ['OWNER', 'MANAGER', 'FRONT_DESK', 'ARTIST'];
const DESK: Role[] = ['OWNER', 'MANAGER', 'FRONT_DESK'];
const MGR: Role[] = ['OWNER', 'MANAGER'];
const OWNER: Role[] = ['OWNER'];

const NAV: { group: string; items: Item[] }[] = [
  { group: '', items: [{ href: '/admin', label: 'Overview', icon: 'home', roles: ALL }] },
  {
    group: 'Bookings',
    items: [
      { href: '/admin/inbox', label: 'Inbox', icon: 'inbox', roles: DESK },
      { href: '/admin/schedule', label: 'Schedule', icon: 'calendar', roles: ALL },
      { href: '/admin/messages', label: 'WhatsApp messages', icon: 'chat', roles: DESK },
      { href: '/admin/emails', label: 'Emails', icon: 'mail', roles: MGR },
    ],
  },
  {
    group: 'Studio',
    items: [
      { href: '/admin/outlets', label: 'Outlets', icon: 'store', roles: OWNER },
      { href: '/admin/users', label: 'Staff', icon: 'users', roles: OWNER },
      { href: '/admin/artists', label: 'Artists', icon: 'pen', roles: MGR },
      { href: '/admin/payment-methods', label: 'Payment methods', icon: 'card', roles: OWNER },
      { href: '/admin/revenue', label: 'Revenue sharing', icon: 'pie', roles: OWNER },
    ],
  },
  {
    group: 'Website',
    items: [
      { href: '/admin/website', label: 'Studio details', icon: 'info', roles: MGR },
      { href: '/admin/styles', label: 'Styles', icon: 'tag', roles: MGR },
      { href: '/admin/gallery', label: 'Gallery', icon: 'image', roles: MGR },
      { href: '/admin/faqs', label: 'FAQs', icon: 'help', roles: MGR },
      { href: '/admin/reviews', label: 'Reviews', icon: 'star', roles: MGR },
    ],
  },
  {
    group: 'System',
    items: [
      { href: '/admin/settings', label: 'Settings', icon: 'settings', roles: OWNER },
      { href: '/admin/audit', label: 'Audit log', icon: 'list', roles: OWNER },
    ],
  },
];

const ROLE_LABEL: Record<Role, string> = { OWNER: 'Owner', MANAGER: 'Manager', FRONT_DESK: 'Front desk', ARTIST: 'Artist' };
const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');

function Shell({ children }: { children: React.ReactNode }) {
  const me = useMe()!;
  const path = usePathname();
  const { inboxCount } = useLive();
  const [open, setOpen] = useState(false);
  const [site, setSite] = useState('');

  // Phone: close the menu after moving to another page.
  useEffect(() => setOpen(false), [path]);
  // On pos.nampani.ink the public website is nampani.ink.
  useEffect(() => {
    if (location.hostname.startsWith('pos.')) setSite(`${location.protocol}//${location.hostname.slice(4)}`);
  }, []);

  async function logout() {
    await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
    location.href = '/login';
  }
  const isOn = (href: string) => (href === '/admin' ? path === href : path === href || path.startsWith(`${href}/`));

  return (
    <div className="shell">
      <nav className={`side${open ? ' open' : ''}`} aria-label="Admin">
        <Link href="/admin" className="brand">NAMPANI INK</Link>
        {NAV.map((g) => {
          const items = g.items.filter((i) => i.roles.includes(me.role));
          if (!items.length) return null;
          return (
            <div key={g.group || 'main'} style={{ display: 'contents' }}>
              {g.group && <div className="group">{g.group}</div>}
              {items.map((i) => (
                <Link key={i.href} href={i.href} className={`nav${isOn(i.href) ? ' on' : ''}`} aria-current={isOn(i.href) ? 'page' : undefined}>
                  <Icon name={i.icon} />
                  {i.label}
                  {i.href === '/admin/inbox' && inboxCount > 0 && <span className="badge" aria-label={`${inboxCount} open`}>{inboxCount}</span>}
                </Link>
              ))}
            </div>
          );
        })}
        {site && (
          <div className="side-foot">
            <div className="card">
              <strong>Nampani Ink website</strong>
              See what customers see. <a href={site} target="_blank" rel="noopener">Open website ↗</a>
            </div>
          </div>
        )}
      </nav>
      {open && <div className="scrim" onClick={() => setOpen(false)} aria-hidden="true" />}

      <div className="content">
        <header className="topbar">
          <button className="icon-btn menu-btn" onClick={() => setOpen(true)} aria-label="Open menu">
            <Icon name="menu" />
          </button>
          <Link href="/admin" className="top-brand">NAMPANI INK</Link>
          <span className="spacer" />
          {DESK.includes(me.role) && (
            <Link href="/admin/inbox" className="icon-btn" aria-label={inboxCount ? `Inbox, ${inboxCount} open` : 'Inbox'} title="Inbox">
              <Icon name="bell" />
              {inboxCount > 0 && <span className="dot" />}
            </Link>
          )}
          <div className="me">
            <span className="avatar" aria-hidden="true">{initials(me.name)}</span>
            <span className="me-text">
              <strong>{me.name}</strong>
              <span>{ROLE_LABEL[me.role]}</span>
            </span>
          </div>
          <button className="icon-btn" onClick={logout} aria-label="Log out" title="Log out">
            <Icon name="logout" />
          </button>
        </header>
        <main className="main">{children}</main>
      </div>
    </div>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <LiveProvider>
        <Shell>{children}</Shell>
      </LiveProvider>
    </SessionProvider>
  );
}
