'use client';

import Link from 'next/link';
import { useMe } from '@/components/Session';

const TILES = [
  { href: '/admin/schedule', title: 'Schedule', text: 'Artist shifts, leave and (soon) bookings by day' },
  { href: '/admin/outlets', title: 'Outlets', text: 'Branches, hours and WhatsApp numbers', owner: true },
  { href: '/admin/users', title: 'Staff', text: 'Logins, roles and outlet access', owner: true },
  { href: '/admin/artists', title: 'Artists', text: 'Profiles, styles, commission and payout period' },
  { href: '/admin/website', title: 'Studio details', text: 'Name, contact, prep tips shown on the website' },
  { href: '/admin/gallery', title: 'Gallery', text: 'Tattoo photos on the website' },
  { href: '/admin/payment-methods', title: 'Payment methods', text: 'Card, transfer, QRIS, cash and their fees', owner: true },
  { href: '/admin/revenue', title: 'Revenue sharing', text: 'How each transaction is split', owner: true },
  { href: '/admin/settings', title: 'Settings', text: 'DP %, discount limit, reminders, WhatsApp switches', owner: true },
];

export default function Overview() {
  const me = useMe()!;
  const tiles = TILES.filter((t) => !t.owner || me.role === 'OWNER');
  return (
    <>
      <div className="head">
        <div>
          <h1>Hello, {me.name.split(' ')[0]}</h1>
          <p className="muted">Bookings and POS arrive in the next release. For now you can set up the studio.</p>
        </div>
      </div>
      {me.role === 'FRONT_DESK' || me.role === 'ARTIST' ? (
        <Link href="/admin/schedule" className="card tile"><h2 style={{ marginBottom: 4 }}>Schedule</h2><p className="muted small">Who is working today and this week. Bookings and POS come next.</p></Link>
      ) : (
        <div className="grid">
          {tiles.map((t) => (
            <Link key={t.href} href={t.href} className="card tile">
              <h2 style={{ marginBottom: 4 }}>{t.title}</h2>
              <p className="muted small">{t.text}</p>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
