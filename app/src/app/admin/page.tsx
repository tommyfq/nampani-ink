'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Icon, IconName } from '@/components/Icons';
import { useLive } from '@/components/Live';
import { useMe } from '@/components/Session';
import { api, ApiError } from '@/lib/api';

interface Summary {
  today: string;
  bookingsToday: number;
  doneToday: number;
  inStudio: number;
  nextWeek: number;
  openRequests: number;
  money: { today: number; paymentsToday: number; week: { date: string; amount: number }[] } | null;
  appointments: {
    id: string;
    code: string;
    kind: 'CONSULTATION' | 'TATTOO';
    status: string;
    startsAt: string;
    customer: { name: string };
    artist: { displayName: string } | null;
    outlet: { name: string };
  }[];
  requests: { id: string; code: string; createdAt: string; preferredDate: string; customer: { name: string } }[];
}

const TZ = 'Asia/Makassar';
const STATUS: Record<string, string> = { BOOKED: 'Booked', CONFIRMED: 'Confirmed', CHECKED_IN: 'In studio', COMPLETED: 'Done' };
const rp = (n: number) => `Rp${n.toLocaleString('id-ID')}`;
const short = (n: number) => (n >= 1e6 ? `${(n / 1e6).toLocaleString('en-GB', { maximumFractionDigits: 1 })}M` : n >= 1e3 ? `${Math.round(n / 1e3)}K` : String(n));
const time = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: TZ });
const ago = (iso: string) => {
  const m = Math.round((Date.now() - +new Date(iso)) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} h ago` : `${Math.round(h / 24)} d ago`;
};
const greeting = () => {
  const h = Number(new Date().toLocaleString('en-GB', { hour: '2-digit', hourCycle: 'h23', timeZone: TZ }));
  return h < 11 ? 'Good morning' : h < 15 ? 'Good afternoon' : h < 22 ? 'Good evening' : 'Good night';
};

function Stat({ href, num, label, icon, tone, pct, foot }: { href: string; num: string; label: string; icon: IconName; tone: string; pct: number; foot: [string, string] }) {
  return (
    <Link href={href} className={`card tile stat ${tone}`}>
      <div className="stat-top">
        <div>
          <div className="num">{num}</div>
          <div className="lbl">{label}</div>
        </div>
        <span className="ico"><Icon name={icon} /></span>
      </div>
      <div className="bar"><i style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} /></div>
      <div className="foot"><span>{foot[0]}</span><span>{foot[1]}</span></div>
    </Link>
  );
}

export default function Overview() {
  const me = useMe()!;
  const { requestTick } = useLive();
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState('');
  const canDash = me.role !== 'ARTIST';

  useEffect(() => {
    if (!canDash) return;
    api<Summary>('/pos/dashboard')
      .then(setData)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Could not load the overview'));
  }, [canDash, requestTick]);

  const dateText = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: TZ });

  const head = (
    <div className="head">
      <div>
        <h1>{greeting()}, {me.name.split(' ')[0]}</h1>
        <p className="muted">{dateText} · Welcome back to the Nampani Ink studio dashboard</p>
      </div>
      <div className="row">
        <Link href="/admin/schedule" className="btn line"><Icon name="calendar" /> Schedule</Link>
        {canDash && <Link href="/admin/inbox" className="btn"><Icon name="inbox" /> Open inbox</Link>}
      </div>
    </div>
  );

  if (!canDash) {
    return (
      <>
        {head}
        <Link href="/admin/schedule" className="card tile" style={{ maxWidth: 480 }}>
          <h2 style={{ marginBottom: 4 }}>Your schedule</h2>
          <p className="muted">Your bookings and shifts for today and the coming days.</p>
        </Link>
      </>
    );
  }
  if (error) return <>{head}<p className="err">{error}</p></>;
  if (!data) return <>{head}<p className="muted">Loading…</p></>;

  const m = data.money;
  const weekMax = Math.max(1, ...(m?.week.map((w) => w.amount) ?? [1]));
  const weekTotal = m?.week.reduce((a, w) => a + w.amount, 0) ?? 0;
  const progress = data.bookingsToday ? Math.round((data.doneToday / data.bookingsToday) * 100) : 0;

  return (
    <>
      {head}

      <div className="stats">
        <Stat
          href={`/admin/schedule?date=${data.today}`}
          num={String(data.bookingsToday)}
          label="Bookings today"
          icon="calendar"
          tone="t-brown"
          pct={progress}
          foot={[`${data.doneToday} done · ${data.inStudio} in studio`, `${progress}%`]}
        />
        <Stat
          href="/admin/inbox"
          num={String(data.openRequests)}
          label="New website requests"
          icon="inbox"
          tone="t-clay"
          pct={data.openRequests ? 100 : 0}
          foot={[data.openRequests ? 'Waiting for a reply' : 'All answered', '']}
        />
        {m ? (
          <Stat
            href="/admin/schedule"
            num={rp(m.today)}
            label="Payments today"
            icon="wallet"
            tone="t-sage"
            pct={(m.today / weekMax) * 100}
            foot={[`${m.paymentsToday} payment${m.paymentsToday === 1 ? '' : 's'}`, 'vs best day']}
          />
        ) : (
          <Stat href="/admin/messages" num="WhatsApp" label="Messages to send" icon="chat" tone="t-sage" pct={0} foot={['Reminders and receipts', '']} />
        )}
        <Stat
          href="/admin/schedule"
          num={String(data.nextWeek)}
          label="Bookings next 7 days"
          icon="clock"
          tone="t-sand"
          pct={data.nextWeek ? (data.bookingsToday / data.nextWeek) * 100 : 0}
          foot={['Including today', '']}
        />
      </div>

      <div className="dash">
        <div className="card">
          <div className="panel-head">
            <h2>Today&apos;s appointments</h2>
            <Link href={`/admin/schedule?date=${data.today}`}>Open schedule →</Link>
          </div>
          {data.appointments.length === 0 ? (
            <p className="empty">No bookings today.</p>
          ) : (
            <div className="list">
              {data.appointments.map((b) => (
                <Link key={b.id} href={`/admin/schedule?date=${data.today}`} className="list-item">
                  <span className="time">{time(b.startsAt)}</span>
                  <span className="who-line">
                    <strong>{b.customer.name}</strong>
                    <span>
                      {b.kind === 'TATTOO' ? 'Tattoo' : 'Consultation'}
                      {b.artist && ` with ${b.artist.displayName}`} · {b.outlet.name} · {b.code}
                    </span>
                  </span>
                  <span className={`status st-${b.status}`}>{STATUS[b.status] ?? b.status}</span>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div style={{ display: 'grid', gap: 18 }}>
          {m && (
            <div className="card">
              <div className="panel-head">
                <h2>Payments, last 7 days</h2>
              </div>
              <div className="big-money">{rp(weekTotal)}</div>
              <p className="muted small">DP and final payments, voided ones left out</p>
              <div className="chart" role="img" aria-label="Payments per day for the last 7 days">
                {m.week.map((w) => (
                  <div key={w.date} className={`col${w.date === data.today ? ' today' : ''}`} title={`${w.date}: ${rp(w.amount)}`}>
                    <span>{w.amount ? short(w.amount) : ''}</span>
                    <i style={{ height: `${(w.amount / weekMax) * 100}%` }} />
                    <span>{new Date(`${w.date}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'short' })}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="card">
            <div className="panel-head">
              <h2>Latest requests</h2>
              <Link href="/admin/inbox">Inbox →</Link>
            </div>
            {data.requests.length === 0 ? (
              <p className="empty">No open requests.</p>
            ) : (
              <div className="list">
                {data.requests.map((r) => (
                  <Link key={r.id} href={`/admin/inbox?id=${r.id}`} className="list-item">
                    <span className="avatar" aria-hidden="true">{r.customer.name.trim()[0]?.toUpperCase()}</span>
                    <span className="who-line">
                      <strong>{r.customer.name}</strong>
                      <span>{r.code}{r.preferredDate && ` · wants ${r.preferredDate}`}</span>
                    </span>
                    <span className="muted small">{ago(r.createdAt)}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
