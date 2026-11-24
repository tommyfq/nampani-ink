'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useLive } from '@/components/Live';
import { useMe } from '@/components/Session';
import { api, ApiError } from '@/lib/api';
import { disablePush, enablePush, pushState, PushState } from '@/lib/push';
import { dateKey, longDate, toInstant } from '@/lib/time';

interface Request {
  id: string;
  code: string;
  kind: 'CONSULTATION' | 'TATTOO';
  createdAt: string;
  preferredDate: string;
  placement: string;
  size: string;
  idea: string;
  design: string;
  photos: string[];
  notes: string;
  customer: { id: string; name: string; phone: string; email: string; marketingOptIn: boolean; _count: { bookings: number } };
  artist: { id: string; displayName: string } | null;
  style: { id: string; name: string } | null;
}
interface ArtistOption { id: string; displayName: string; homeOutletId: string | null }
interface Outlet { id: string; name: string; timezone: string }

const ago = (iso: string) => {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  return h < 24 ? `${h} h ago` : `${Math.round(h / 24)} d ago`;
};

export default function InboxPage() {
  const me = useMe()!;
  const { requestTick, refreshCount, connected } = useLive();
  const [outlets, setOutlets] = useState<Outlet[] | null>(null);
  const [outletId, setOutletId] = useState('');
  const [data, setData] = useState<{ requests: Request[]; artists: ArtistOption[] } | null>(null);
  const [error, setError] = useState('');
  const [focus, setFocus] = useState<string | null>(null);
  const [open, setOpen] = useState<{ id: string; mode: 'schedule' | 'decline' } | null>(null);

  useEffect(() => {
    setFocus(new URLSearchParams(location.search).get('id'));
    api<Outlet[]>('/admin/outlets').then((list) => {
      setOutlets(list);
      let saved: string | null = null;
      try {
        saved = localStorage.getItem('npi.outlet');
      } catch {
        /* private mode */
      }
      setOutletId(list.find((o) => o.id === saved)?.id ?? list[0]?.id ?? '');
    });
  }, []);

  const load = useCallback(async () => {
    if (!outletId) return;
    try {
      setData(await api(`/pos/inbox?outletId=${outletId}`));
      setError('');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load the inbox');
    }
  }, [outletId]);

  useEffect(() => {
    load();
  }, [load, requestTick]);

  useEffect(() => {
    if (focus && data) document.getElementById(`req-${focus}`)?.scrollIntoView({ block: 'center' });
  }, [focus, data]);

  if (me.role === 'ARTIST') return <p className="muted">You do not have access to this page.</p>;
  const outlet = outlets?.find((o) => o.id === outletId);
  const tz = outlet?.timezone ?? 'Asia/Makassar';
  const done = () => {
    setOpen(null);
    load();
    refreshCount();
  };

  return (
    <>
      <div className="head">
        <div>
          <h1>Inbox</h1>
          <p className="muted">
            Booking requests from the website. Schedule a consultation (or a tattoo) to move it to the schedule, or decline it.
            {!connected && <span> · Reconnecting… new requests still appear within a minute.</span>}
          </p>
        </div>
        <div className="row">
          {outlets && outlets.length > 1 && (
            <select value={outletId} onChange={(e) => setOutletId(e.target.value)} aria-label="Outlet" style={{ width: 'auto' }}>
              {outlets.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          )}
        </div>
      </div>

      <NotificationToggle />

      {error && <p className="err">{error}</p>}
      {!data ? (
        <p className="muted">Loading…</p>
      ) : data.requests.length === 0 ? (
        <div className="card muted">No open requests. New ones appear here straight away{connected ? ', with a sound' : ''}.</div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {data.requests.map((r) => (
            <article key={r.id} id={`req-${r.id}`} className={`card req${focus === r.id ? ' focus' : ''}`}>
              <div className="row" style={{ alignItems: 'flex-start' }}>
                <div style={{ minWidth: 0 }}>
                  <div className="row" style={{ gap: 8 }}>
                    <strong style={{ fontSize: 16 }}>{r.customer.name}</strong>
                    <span className="pill">{r.code}</span>
                    {r.customer._count.bookings > 1 && <span className="pill">Returning customer</span>}
                    {r.customer.marketingOptIn && <span className="pill">News: yes</span>}
                  </div>
                  <div className="muted small">
                    {ago(r.createdAt)} · <a href={`https://wa.me/${r.customer.phone}?text=${encodeURIComponent(`Hi ${r.customer.name.split(' ')[0]}, thank you for your request ${r.code} at Nampani Ink ${outlet?.name ?? ''}! `)}`} target="_blank" rel="noopener noreferrer">+{r.customer.phone}</a>
                    {r.customer.email && <> · <a href={`mailto:${r.customer.email}`}>{r.customer.email}</a></>}
                  </div>
                </div>
                <span className="spacer" />
                <div className="row">
                  <button className="btn" onClick={() => setOpen({ id: r.id, mode: 'schedule' })}>Schedule</button>
                  <button className="btn line" onClick={() => setOpen({ id: r.id, mode: 'decline' })}>Decline</button>
                </div>
              </div>

              <dl className="facts">
                <div><dt>Artist</dt><dd>{r.artist?.displayName ?? 'Any available'}</dd></div>
                <div><dt>Style</dt><dd>{r.style?.name ?? 'Not sure yet'}</dd></div>
                <div><dt>Preferred date</dt><dd>{r.preferredDate ? longDate(r.preferredDate) : '—'}</dd></div>
                <div><dt>Placement</dt><dd>{r.placement || '—'}</dd></div>
                <div><dt>Size</dt><dd>{r.size || '—'}</dd></div>
                {r.design && <div><dt>Gallery design</dt><dd>{r.design}</dd></div>}
              </dl>
              {r.idea && <p className="idea">{r.idea}</p>}
              {r.notes && <p className="muted small">{r.notes}</p>}
              {r.photos.length > 0 && (
                <div className="refs">
                  {r.photos.map((p, i) => (
                    <a key={p} href={p} target="_blank" rel="noopener noreferrer" title={`Reference photo ${i + 1}`}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p} alt={`Reference photo ${i + 1}`} loading="lazy" />
                    </a>
                  ))}
                </div>
              )}

              {open?.id === r.id && open.mode === 'schedule' && (
                <ScheduleForm r={r} artists={data.artists} outletId={outletId} tz={tz} canOverride={me.role === 'OWNER' || me.role === 'MANAGER'} onCancel={() => setOpen(null)} onDone={done} />
              )}
              {open?.id === r.id && open.mode === 'decline' && <DeclineForm r={r} onCancel={() => setOpen(null)} onDone={done} />}
            </article>
          ))}
        </div>
      )}
    </>
  );
}

function ScheduleForm({ r, artists, outletId, tz, canOverride, onCancel, onDone }: {
  r: Request; artists: ArtistOption[]; outletId: string; tz: string; canOverride: boolean; onCancel: () => void; onDone: () => void;
}) {
  const today = dateKey(new Date(), tz);
  const [kind, setKind] = useState<Request['kind']>(r.kind);
  const [artistId, setArtistId] = useState(r.artist?.id ?? '');
  const [date, setDate] = useState(r.preferredDate && r.preferredDate >= today ? r.preferredDate : today);
  // Today: the next full hour (never a time that has passed); other days: noon.
  const nextHour = () => {
    const h = Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hourCycle: 'h23', timeZone: tz }).format(new Date())) + 1;
    return `${String(Math.min(h, 23)).padStart(2, '0')}:00`;
  };
  const [start, setStart] = useState(() => (date === today ? nextHour() : '12:00'));
  const [length, setLength] = useState(30);
  const [override, setOverride] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [scheduled, setScheduled] = useState(false);
  const here = artists.filter((a) => !a.homeOutletId || a.homeOutletId === outletId);

  useEffect(() => setLength(kind === 'CONSULTATION' ? 30 : 180), [kind]);

  async function save() {
    if (!artistId) return setError('Choose an artist');
    setBusy(true);
    setError('');
    const startsAt = toInstant(date, start, tz);
    const endsAt = new Date(startsAt.getTime() + length * 60_000);
    try {
      await api(`/pos/bookings/${r.id}`, { method: 'PATCH', body: { kind, artistId, startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(), allowOutsideShift: override || undefined } });
      setScheduled(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.issues[0]?.message ?? e.message : 'Could not schedule');
    }
    setBusy(false);
  }

  if (scheduled) {
    return (
      <div className="inline-form">
        <p className="ok">Scheduled: {kind === 'CONSULTATION' ? 'consultation' : 'tattoo'} on {longDate(date)} at {start}.</p>
        <div className="row">
          <Link className="btn line" href={`/admin/schedule?date=${date}`}>Open the schedule</Link>
          <button className="btn" onClick={onDone}>Done</button>
        </div>
      </div>
    );
  }

  return (
    <div className="inline-form">
      <div className="grid-form">
        <label>Type
          <select value={kind} onChange={(e) => setKind(e.target.value as Request['kind'])}>
            <option value="CONSULTATION">Consultation</option>
            <option value="TATTOO">Tattoo</option>
          </select>
        </label>
        <label>Artist
          <select value={artistId} onChange={(e) => setArtistId(e.target.value)}>
            <option value="">Choose…</option>
            {here.map((a) => <option key={a.id} value={a.id}>{a.displayName}</option>)}
          </select>
        </label>
        <label>Date<input type="date" min={today} value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <label>Start<input type="time" step={900} value={start} onChange={(e) => setStart(e.target.value)} /></label>
        <label>Length
          <select value={length} onChange={(e) => setLength(Number(e.target.value))}>
            {[15, 30, 45, 60, 90, 120, 180, 240, 300, 360, 480].map((m) => <option key={m} value={m}>{m < 60 ? `${m} min` : `${m / 60} h`}</option>)}
          </select>
        </label>
      </div>
      {canOverride && (
        <label className="row small" style={{ gap: 6, marginTop: 8 }}>
          <input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} style={{ width: 'auto' }} />
          Book outside the artist&apos;s shift
        </label>
      )}
      {error && <p className="err">{error}</p>}
      <div className="row" style={{ marginTop: 10 }}>
        <button className="btn" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Schedule'}</button>
        <button className="btn line" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

const REASONS = ['Not a style we tattoo', 'Fully booked on the dates asked', 'Customer cancelled', 'Duplicate request', 'Spam'];

function DeclineForm({ r, onCancel, onDone }: { r: Request; onCancel: () => void; onDone: () => void }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function save() {
    if (!note.trim()) return setError('Add a short reason');
    setBusy(true);
    try {
      await api(`/pos/bookings/${r.id}/status`, { method: 'POST', body: { status: 'CANCELLED', note } });
      onDone();
    } catch (e) {
      setError(e instanceof ApiError ? e.issues[0]?.message ?? e.message : 'Could not decline');
      setBusy(false);
    }
  }
  return (
    <div className="inline-form">
      <label>Reason (saved in the booking history; the customer does not see it)
        <input value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} list={`reasons-${r.id}`} placeholder="e.g. Fully booked on the dates asked" />
        <datalist id={`reasons-${r.id}`}>{REASONS.map((x) => <option key={x} value={x} />)}</datalist>
      </label>
      {error && <p className="err">{error}</p>}
      <div className="row" style={{ marginTop: 10 }}>
        <button className="btn danger" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Decline request'}</button>
        <button className="btn line" onClick={onCancel}>Keep it</button>
      </div>
    </div>
  );
}

const PUSH_TEXT: Record<PushState, string> = {
  unsupported: 'This browser cannot show notifications. Use Chrome, Edge or Firefox to get them.',
  'ios-home-screen': 'On iPhone or iPad: tap Share → Add to Home Screen, open the POS from the home screen, then turn notifications on here.',
  unavailable: 'Notifications are not set up on the server yet.',
  denied: 'Notifications are blocked for this site. Allow them in the browser settings (lock icon next to the address), then reload.',
  off: 'Get a pop-up on this device when a request arrives, even when the POS is closed.',
  on: 'This device gets a pop-up for every new request.',
};

function NotificationToggle() {
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    pushState().then(setState);
  }, []);
  if (!state) return null;
  async function toggle() {
    setBusy(true);
    setError('');
    try {
      setState(state === 'on' ? await disablePush() : await enablePush());
    } catch (e) {
      setError(e instanceof ApiError ? e.message : (e as Error).message || 'Could not change notifications');
    }
    setBusy(false);
  }
  const canToggle = state === 'on' || state === 'off';
  return (
    <div className={`card notify ${state}`} style={{ marginBottom: 14 }}>
      <div className="row">
        <div>
          <strong>Notifications on this device: {state === 'on' ? 'on' : 'off'}</strong>
          <div className="muted small">{PUSH_TEXT[state]}</div>
        </div>
        <span className="spacer" />
        {canToggle && (
          <button className={state === 'on' ? 'btn line' : 'btn'} disabled={busy} onClick={toggle}>
            {busy ? 'Please wait…' : state === 'on' ? 'Turn off' : 'Turn on notifications'}
          </button>
        )}
      </div>
      {error && <p className="err">{error}</p>}
    </div>
  );
}
