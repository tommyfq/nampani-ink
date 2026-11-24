'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LiveProvider, useLive } from '@/components/Live';
import { SessionProvider, useMe } from '@/components/Session';
import { api, Role } from '@/lib/api';

const NAV: { group: string; items: { href: string; label: string; roles: Role[] }[] }[] = [
  {
    group: 'Studio',
    items: [
      { href: '/admin', label: 'Overview', roles: ['OWNER', 'MANAGER', 'FRONT_DESK', 'ARTIST'] },
      { href: '/admin/inbox', label: 'Inbox', roles: ['OWNER', 'MANAGER', 'FRONT_DESK'] },
      { href: '/admin/schedule', label: 'Schedule', roles: ['OWNER', 'MANAGER', 'FRONT_DESK', 'ARTIST'] },
      { href: '/admin/messages', label: 'WhatsApp messages', roles: ['OWNER', 'MANAGER', 'FRONT_DESK'] },
      { href: '/admin/emails', label: 'Emails', roles: ['OWNER', 'MANAGER'] },
      { href: '/admin/outlets', label: 'Outlets', roles: ['OWNER'] },
      { href: '/admin/users', label: 'Staff', roles: ['OWNER'] },
      { href: '/admin/artists', label: 'Artists', roles: ['OWNER', 'MANAGER'] },
    ],
  },
  {
    group: 'Website',
    items: [
      { href: '/admin/website', label: 'Studio details', roles: ['OWNER', 'MANAGER'] },
      { href: '/admin/styles', label: 'Styles', roles: ['OWNER', 'MANAGER'] },
      { href: '/admin/gallery', label: 'Gallery', roles: ['OWNER', 'MANAGER'] },
      { href: '/admin/faqs', label: 'FAQs', roles: ['OWNER', 'MANAGER'] },
      { href: '/admin/reviews', label: 'Reviews', roles: ['OWNER', 'MANAGER'] },
    ],
  },
  {
    group: 'Money',
    items: [
      { href: '/admin/payment-methods', label: 'Payment methods', roles: ['OWNER'] },
      { href: '/admin/revenue', label: 'Revenue sharing', roles: ['OWNER'] },
      { href: '/admin/settings', label: 'Settings', roles: ['OWNER'] },
      { href: '/admin/audit', label: 'Audit log', roles: ['OWNER'] },
    ],
  },
];

function Shell({ children }: { children: React.ReactNode }) {
  const me = useMe()!;
  const path = usePathname();
  const { inboxCount } = useLive();
  async function logout() {
    await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
    location.href = '/login';
  }
  return (
    <div className="shell">
      <nav className="side" aria-label="Admin">
        <div className="brand">NAMPANI INK</div>
        {NAV.map((g) => {
          const items = g.items.filter((i) => i.roles.includes(me.role));
          if (!items.length) return null;
          return (
            <div key={g.group} style={{ display: 'contents' }}>
              <div className="group">{g.group}</div>
              {items.map((i) => (
                <Link key={i.href} href={i.href} className={path === i.href ? 'on' : ''}>
                  {i.label}
                  {i.href === '/admin/inbox' && inboxCount > 0 && <span className="badge" aria-label={`${inboxCount} open`}>{inboxCount}</span>}
                </Link>
              ))}
            </div>
          );
        })}
        <div className="who">
          <span className="who-text">
            {me.name}
            <br />
            {me.role.replace('_', ' ').toLowerCase()}
            <br />
          </span>
          <button className="btn ghost" onClick={logout}>Log out</button>
        </div>
      </nav>
      <main className="main">{children}</main>
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
