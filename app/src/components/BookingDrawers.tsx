'use client';

import { FormEvent, useEffect, useState } from 'react';
import { api, ApiError, Role } from '@/lib/api';
import { addDays, dateKey, longDate, toInstant } from '@/lib/time';
import { MessageItem, MessageRow } from './MessageRow';
import { Payment, PaymentPanel } from './PaymentPanel';

export type BookingStatus = 'REQUESTED' | 'BOOKED' | 'CONFIRMED' | 'CHECKED_IN' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';
export interface Booking {
  id: string;
  code: string;
  kind: 'CONSULTATION' | 'TATTOO';
  status: BookingStatus;
  source: 'WEBSITE' | 'POS' | 'WALK_IN';
  startsAt: string | null;
  endsAt: string | null;
  artistId: string | null;
  styleId: string | null;
  placement: string;
  size: string;
  idea: string;
  notes: string;
  quotedPrice: number | null;
  parentId: string | null;
  customer: { id: string; name: string; phone: string; email: string };
  artist: { id: string; displayName: string } | null;
  style: { id: string; name: string } | null;
}
interface Detail extends Booking {
  events: { id: string; type: string; fromStatus: BookingStatus | null; toStatus: BookingStatus | null; note: string; at: string; user: { name: string } | null }[];
  parent: { id: string; code: string; kind: string } | null;
  followUps: { id: string; code: string; kind: string; status: BookingStatus; startsAt: string | null }[];
  payments: Payment[];
  outletId: string;
}
interface Customer { id: string; name: string; phone: string; email: string; _count?: { bookings: number } }
export interface Ctx {
  outletId: string;
  tz: string;
  role: Role;
  artists: { id: string; displayName: string }[];
  styles: { id: string; name: string }[];
}

export const STATUS_LABEL: Record<BookingStatus, string> = {
  REQUESTED: 'Requested',
  BOOKED: 'Booked',
  CONFIRMED: 'Confirmed',
  CHECKED_IN: 'Checked in',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  NO_SHOW: 'No-show',
};
export const KIND_LABEL = { CONSULTATION: 'Consultation', TATTOO: 'Tattoo' } as const;

const DURATIONS = [30, 60, 90, 120, 180, 240, 300, 360, 480];
const durLabel = (m: number) => (m < 60 ? `${m} min` : `${m / 60} hour${m === 60 ? '' : 's'}`);
const rupiah = (n: number | null) => (n == null ? '—' : `Rp${n.toLocaleString('id-ID')}`);
const hhmmIn = (iso: string, tz: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: tz, hourCycle: 'h23' });
const issueText = (err: unknown) => (err instanceof ApiError ? err.issues[0]?.message ?? err.message : 'Could not save');

// ---------------------------------------------------------------------------
// New booking
// ---------------------------------------------------------------------------

export function NewBookingDrawer({
  ctx,
  preset,
  onClose,
  onSaved,
}: {
  ctx: Ctx;
  preset: { artistId: string; day: string; time: string; kind?: Booking['kind']; customer?: Customer; parentId?: string; outsideShift?: boolean };
  onClose: () => void;
  onSaved: (b: Booking) => void;
}) {
  const [kind, setKind] = useState<Booking['kind']>(preset.kind ?? 'CONSULTATION');
  const [walkIn, setWalkIn] = useState(false);
  const [artistId, setArtistId] = useState(preset.artistId);
  const [day, setDay] = useState(preset.day);
  const [time, setTime] = useState(preset.time);
  const [duration, setDuration] = useState(preset.kind === 'TATTOO' ? 120 : 30);
  const [customer, setCustomer] = useState<Customer | null>(preset.customer ?? null);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<Customer[]>([]);
  const [newCust, setNewCust] = useState({ name: '', phone: '', email: '' });
  const [styleId, setStyleId] = useState('');
  const [placement, setPlacement] = useState('');
  const [size, setSize] = useState('');
  const [idea, setIdea] = useState('');
  const [price, setPrice] = useState('');
  const [notes, setNotes] = useState('');
  const [outside, setOutside] = useState(Boolean(preset.outsideShift));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const canOverride = ctx.role === 'OWNER' || ctx.role === 'MANAGER';

  useEffect(() => {
    if (customer || search.trim().length < 2) {
      setResults([]);
      return;
    }
    const t = setTimeout(() => {
      api<Customer[]>(`/pos/customers?q=${encodeURIComponent(search.trim())}`).then(setResults).catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(t);
  }, [search, customer]);

  function clearErr(k: string) {
    setErrors((e) => ({ ...e, [k]: '' }));
    setFormError('');
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!customer) {
      if (!newCust.name.trim()) errs.name = 'Enter the customer name';
      if (!newCust.phone.trim()) errs.phone = 'Enter the WhatsApp number';
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) errs.day = 'Choose a date';
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) errs.time = 'Use HH:MM, e.g. 14:00';
    if (price && !/^\d+$/.test(price.replace(/[.,\s]/g, ''))) errs.price = 'Numbers only, e.g. 1500000';
    if (Object.keys(errs).length) {
      setErrors(errs);
      setFormError('Please fix the highlighted fields');
      return;
    }
    const start = toInstant(day, time, ctx.tz);
    const end = new Date(+start + duration * 60000);
    setBusy(true);
    try {
      const b = await api<Booking>('/pos/bookings', {
        method: 'POST',
        body: {
          outletId: ctx.outletId,
          artistId,
          kind,
          source: walkIn ? 'WALK_IN' : 'POS',
          startsAt: start.toISOString(),
          endsAt: end.toISOString(),
          customer: customer ? { id: customer.id } : { name: newCust.name.trim(), phone: newCust.phone.trim(), email: newCust.email.trim() },
          styleId: styleId || null,
          placement,
          size,
          idea,
          notes,
          quotedPrice: price ? Number(price.replace(/[.,\s]/g, '')) : null,
          parentId: preset.parentId ?? null,
          allowOutsideShift: canOverride && outside,
        },
      });
      onSaved(b);
    } catch (err) {
      if (err instanceof ApiError && err.issues.length) {
        const map: Record<string, string> = {};
        for (const i of err.issues) map[i.path.replace('customer.', '')] = i.message;
        setErrors(map);
        setFormError('Please fix the highlighted fields');
      } else setFormError(issueText(err));
      setBusy(false);
    }
  }

  const err = (k: string) => (errors[k] ? <span className="err">{errors[k]}</span> : null);

  return (
    <div className="drawer-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="drawer" onSubmit={submit} noValidate>
        <div className="head">
          <div>
            <h2 style={{ marginBottom: 2 }}>{preset.parentId ? 'Book tattoo appointment' : 'New booking'}</h2>
            <p className="muted small">{longDate(day)}</p>
          </div>
          <button type="button" className="btn line" onClick={onClose}>Close</button>
        </div>

        <div className="seg" role="radiogroup" aria-label="Booking type">
          {(['CONSULTATION', 'TATTOO'] as const).map((k) => (
            <button
              type="button"
              key={k}
              role="radio"
              aria-checked={kind === k}
              className={kind === k ? 'on' : ''}
              onClick={() => {
                setKind(k);
                setDuration(k === 'TATTOO' ? 120 : 30);
              }}
            >
              {KIND_LABEL[k]}
            </button>
          ))}
        </div>

        <section className="card" style={{ margin: '14px 0' }}>
          <h2>Customer</h2>
          {customer ? (
            <div className="row">
              <div>
                <strong>{customer.name}</strong>
                <div className="muted small">+{customer.phone}{customer._count ? ` · ${customer._count.bookings} booking(s)` : ''}</div>
              </div>
              <span className="spacer" />
              {!preset.customer && <button type="button" className="btn line" onClick={() => setCustomer(null)}>Change</button>}
            </div>
          ) : (
            <>
              <label className="f">
                Find existing customer (name or WhatsApp number)
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="e.g. Jess or 0812…" />
              </label>
              {results.length > 0 && (
                <div className="results">
                  {results.map((c) => (
                    <button type="button" key={c.id} onClick={() => { setCustomer(c); setSearch(''); clearErr('name'); clearErr('phone'); }}>
                      <strong>{c.name}</strong> <span className="muted small">+{c.phone} · {c._count?.bookings ?? 0} booking(s)</span>
                    </button>
                  ))}
                </div>
              )}
              <p className="muted small" style={{ margin: '10px 0 6px' }}>Or add a new customer:</p>
              <div className="form">
                <label className="f">Name<input value={newCust.name} onChange={(e) => { setNewCust({ ...newCust, name: e.target.value }); clearErr('name'); }} />{err('name')}</label>
                <label className="f">WhatsApp number<input value={newCust.phone} inputMode="tel" placeholder="0812… or +61 4…" onChange={(e) => { setNewCust({ ...newCust, phone: e.target.value }); clearErr('phone'); }} />{err('phone')}</label>
                <label className="f full">Email (optional)<input type="email" value={newCust.email} onChange={(e) => setNewCust({ ...newCust, email: e.target.value })} />{err('email')}</label>
              </div>
            </>
          )}
        </section>

        <div className="form">
          <label className="f">
            Artist
            <select value={artistId} onChange={(e) => setArtistId(e.target.value)}>
              {ctx.artists.map((a) => <option key={a.id} value={a.id}>{a.displayName}</option>)}
            </select>
          </label>
          <label className="f">Date<input type="date" value={day} onChange={(e) => { setDay(e.target.value); clearErr('day'); }} />{err('day')}</label>
          <label className="f">Start time<input value={time} inputMode="numeric" placeholder="HH:MM" onChange={(e) => { setTime(e.target.value); clearErr('time'); }} />{err('time')}</label>
          <label className="f">
            Duration
            <select value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
              {DURATIONS.map((m) => <option key={m} value={m}>{durLabel(m)}</option>)}
            </select>
            {err('endsAt')}
          </label>
          <label className="f">
            Style
            <select value={styleId} onChange={(e) => setStyleId(e.target.value)}>
              <option value="">— not decided —</option>
              {ctx.styles.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <label className="f">Placement<input value={placement} onChange={(e) => setPlacement(e.target.value)} placeholder="e.g. Forearm" /></label>
          <label className="f">Size<input value={size} onChange={(e) => setSize(e.target.value)} placeholder="e.g. 10 cm" /></label>
          {kind === 'TATTOO' && (
            <label className="f">Quoted price (Rp)<input value={price} inputMode="numeric" placeholder="e.g. 1500000" onChange={(e) => { setPrice(e.target.value); clearErr('price'); }} />{err('price')}</label>
          )}
          <label className="f full">Idea<textarea value={idea} onChange={(e) => setIdea(e.target.value)} placeholder="What the customer wants" /></label>
          <label className="f full">Internal notes (staff only)<textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
          <label className="f check full">
            <input type="checkbox" checked={walkIn} onChange={(e) => setWalkIn(e.target.checked)} />
            Walk-in (customer is here now: checked in straight away)
          </label>
          {canOverride && (
            <label className="f check full">
              <input type="checkbox" checked={outside} onChange={(e) => setOutside(e.target.checked)} />
              Allow outside the artist&apos;s shift (owner / manager)
            </label>
          )}
        </div>

        {formError && <p className="err" style={{ marginTop: 12 }} role="alert">{formError}</p>}
        <button className="btn" type="submit" style={{ marginTop: 16 }} disabled={busy}>{busy ? 'Saving…' : 'Save booking'}</button>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Booking detail
// ---------------------------------------------------------------------------

const ACTIONS: Record<BookingStatus, { to: BookingStatus; label: (k: Booking['kind']) => string; reason?: boolean; managers?: boolean; style?: string }[]> = {
  REQUESTED: [{ to: 'CANCELLED', label: () => 'Cancel', reason: true, style: 'danger' }],
  BOOKED: [
    { to: 'CONFIRMED', label: () => 'Customer confirmed' },
    { to: 'CHECKED_IN', label: () => 'Check in' },
    { to: 'NO_SHOW', label: () => 'No-show', reason: true, style: 'danger' },
    { to: 'CANCELLED', label: () => 'Cancel', reason: true, style: 'danger' },
  ],
  CONFIRMED: [
    { to: 'CHECKED_IN', label: () => 'Check in' },
    { to: 'NO_SHOW', label: () => 'No-show', reason: true, style: 'danger' },
    { to: 'CANCELLED', label: () => 'Cancel', reason: true, style: 'danger' },
  ],
  CHECKED_IN: [
    { to: 'COMPLETED', label: (k) => (k === 'TATTOO' ? 'Complete' : 'Consultation done') },
    { to: 'CANCELLED', label: () => 'Cancel', reason: true, style: 'danger' },
  ],
  COMPLETED: [],
  CANCELLED: [{ to: 'BOOKED', label: () => 'Reopen', managers: true }],
  NO_SHOW: [{ to: 'BOOKED', label: () => 'Reopen', managers: true }],
};

export function BookingDrawer({
  id,
  ctx,
  onClose,
  onChanged,
  onFollowUp,
}: {
  id: string;
  ctx: Ctx;
  onClose: () => void;
  onChanged: () => void;
  onFollowUp: (b: Detail) => void;
}) {
  const [b, setB] = useState<Detail | null>(null);
  const [msgs, setMsgs] = useState<MessageItem[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [reasonFor, setReasonFor] = useState<BookingStatus | null>(null);
  const [reason, setReason] = useState('');
  const [moving, setMoving] = useState(false);
  const [mv, setMv] = useState({ day: '', time: '', duration: 60, artistId: '', outside: false });
  const canAct = ctx.role !== 'ARTIST';
  const isManager = ctx.role === 'OWNER' || ctx.role === 'MANAGER';

  const loadMsgs = () => {
    if (ctx.role !== 'ARTIST') api<MessageItem[]>(`/pos/messages?bookingId=${id}`).then(setMsgs).catch(() => setMsgs([]));
  };
  const load = () =>
    api<Detail>(`/pos/bookings/${id}`)
      .then((d) => {
        setB(d);
        if (d.startsAt && d.endsAt) {
          setMv({
            day: dateKey(new Date(d.startsAt), ctx.tz),
            time: hhmmIn(d.startsAt, ctx.tz),
            duration: Math.round((+new Date(d.endsAt) - +new Date(d.startsAt)) / 60000),
            artistId: d.artistId ?? '',
            outside: false,
          });
        }
      })
      .catch((e) => setError(issueText(e)));
  useEffect(() => {
    load();
    loadMsgs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function setStatus(to: BookingStatus, note = '') {
    setBusy(true);
    setError('');
    try {
      await api(`/pos/bookings/${id}/status`, { method: 'POST', body: { status: to, note } });
      setReasonFor(null);
      setReason('');
      await load();
      loadMsgs();
      onChanged();
    } catch (err) {
      setError(issueText(err));
    }
    setBusy(false);
  }

  async function reschedule(e: FormEvent) {
    e.preventDefault();
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(mv.time) || !/^\d{4}-\d{2}-\d{2}$/.test(mv.day)) {
      setError('Choose a date and a time (HH:MM)');
      return;
    }
    const start = toInstant(mv.day, mv.time, ctx.tz);
    setBusy(true);
    setError('');
    try {
      await api(`/pos/bookings/${id}`, {
        method: 'PATCH',
        body: { artistId: mv.artistId, startsAt: start.toISOString(), endsAt: new Date(+start + mv.duration * 60000).toISOString(), allowOutsideShift: isManager && mv.outside },
      });
      setMoving(false);
      await load();
      onChanged();
    } catch (err) {
      setError(issueText(err));
    }
    setBusy(false);
  }

  if (!b) {
    return (
      <div className="drawer-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
        <div className="drawer"><p className={error ? 'err' : 'muted'}>{error || 'Loading…'}</p></div>
      </div>
    );
  }

  const closed = ['COMPLETED', 'CANCELLED', 'NO_SHOW'].includes(b.status);
  // Tattoo bookings are confirmed by the DP and completed by the final payment (see Payments).
  const actions = ACTIONS[b.status].filter((a) => (!a.managers || isManager) && !(b.kind === 'TATTOO' && (a.to === 'CONFIRMED' || a.to === 'COMPLETED')));
  const when = b.startsAt && b.endsAt ? `${longDate(dateKey(new Date(b.startsAt), ctx.tz))}, ${hhmmIn(b.startsAt, ctx.tz)}–${hhmmIn(b.endsAt, ctx.tz)}` : 'No time set yet';

  return (
    <div className="drawer-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="drawer">
        <div className="head">
          <div>
            <p className="muted small">{b.code} · {KIND_LABEL[b.kind]}{b.source === 'WALK_IN' ? ' · Walk-in' : ''}</p>
            <h2 style={{ margin: '2px 0' }}>{b.customer.name}</h2>
            <span className={`status st-${b.status}`}>{STATUS_LABEL[b.status]}</span>
          </div>
          <button className="btn line" onClick={onClose}>Close</button>
        </div>

        <table style={{ marginBottom: 14 }}>
          <tbody>
            <tr><th>When</th><td>{when}</td></tr>
            <tr><th>Artist</th><td>{b.artist?.displayName ?? '—'}</td></tr>
            {b.customer.phone && <tr><th>WhatsApp</th><td>+{b.customer.phone}{b.customer.email && ` · ${b.customer.email}`}</td></tr>}
            <tr><th>Style</th><td>{b.style?.name ?? '—'}{(b.placement || b.size) && ` · ${[b.placement, b.size].filter(Boolean).join(', ')}`}</td></tr>
            {b.kind === 'TATTOO' && canAct && <tr><th>Quoted price</th><td>{rupiah(b.quotedPrice)}</td></tr>}
            {b.idea && <tr><th>Idea</th><td style={{ whiteSpace: 'pre-wrap' }}>{b.idea}</td></tr>}
            {b.notes && <tr><th>Staff notes</th><td style={{ whiteSpace: 'pre-wrap' }}>{b.notes}</td></tr>}
            {b.parent && <tr><th>From</th><td>Consultation {b.parent.code}</td></tr>}
            {b.followUps.length > 0 && <tr><th>Follow-up</th><td>{b.followUps.map((f) => `${f.code} (${STATUS_LABEL[f.status]})`).join(', ')}</td></tr>}
          </tbody>
        </table>

        {canAct && b.kind === 'TATTOO' && (
          <PaymentPanel
            booking={b}
            outletId={b.outletId}
            role={ctx.role}
            onChanged={() => {
              load();
              loadMsgs();
              onChanged();
            }}
          />
        )}

        {canAct && msgs.length > 0 && (
          <section className="card" style={{ marginBottom: 14 }}>
            <h2>WhatsApp</h2>
            <div style={{ display: 'grid', gap: 10 }}>
              {msgs.map((m) => <MessageRow key={m.key} m={m} tz={ctx.tz} compact onChanged={loadMsgs} />)}
            </div>
          </section>
        )}

        {canAct && (
          <>
            {actions.length > 0 && !reasonFor && (
              <div className="row" style={{ marginBottom: 12 }}>
                {actions.map((a) => (
                  <button
                    key={a.to}
                    className={`btn${a.style === 'danger' ? ' danger' : a.to === 'BOOKED' ? ' line' : ''}`}
                    disabled={busy}
                    onClick={() => (a.reason ? setReasonFor(a.to) : setStatus(a.to))}
                  >
                    {a.label(b.kind)}
                  </button>
                ))}
              </div>
            )}
            {reasonFor && (
              <form
                className="card"
                style={{ marginBottom: 12 }}
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!reason.trim()) {
                    setError('Add a short reason');
                    return;
                  }
                  setStatus(reasonFor, reason.trim());
                }}
              >
                <label className="f">
                  Reason for {STATUS_LABEL[reasonFor].toLowerCase()}
                  <input value={reason} autoFocus maxLength={300} onChange={(e) => { setReason(e.target.value); setError(''); }} placeholder="e.g. Customer is sick" />
                </label>
                <p className="muted small" style={{ marginTop: 6 }}>The DP is not refunded. It is shared as a forfeited DP (90% artist, 10% marketing).</p>
                <div className="row" style={{ marginTop: 10 }}>
                  <button className="btn danger" type="submit" disabled={busy}>Confirm {STATUS_LABEL[reasonFor].toLowerCase()}</button>
                  <button className="btn line" type="button" onClick={() => { setReasonFor(null); setReason(''); setError(''); }}>Back</button>
                </div>
              </form>
            )}

            <div className="row" style={{ marginBottom: 14 }}>
              {!closed && b.startsAt && <button className="btn line" onClick={() => setMoving((m) => !m)}>{moving ? 'Close reschedule' : 'Reschedule'}</button>}
              {b.kind === 'CONSULTATION' && ['CHECKED_IN', 'COMPLETED', 'CONFIRMED', 'BOOKED'].includes(b.status) && (
                <button className="btn line" onClick={() => onFollowUp(b)}>Book tattoo appointment</button>
              )}
            </div>

            {moving && (
              <form className="card" style={{ marginBottom: 14 }} onSubmit={reschedule} noValidate>
                <h2>Reschedule</h2>
                <div className="form">
                  <label className="f">Artist
                    <select value={mv.artistId} onChange={(e) => setMv({ ...mv, artistId: e.target.value })}>
                      {ctx.artists.map((a) => <option key={a.id} value={a.id}>{a.displayName}</option>)}
                    </select>
                  </label>
                  <label className="f">Date<input type="date" value={mv.day} onChange={(e) => setMv({ ...mv, day: e.target.value })} /></label>
                  <label className="f">Start time<input value={mv.time} inputMode="numeric" onChange={(e) => setMv({ ...mv, time: e.target.value })} /></label>
                  <label className="f">Duration
                    <select value={mv.duration} onChange={(e) => setMv({ ...mv, duration: Number(e.target.value) })}>
                      {[...new Set([...DURATIONS, mv.duration])].sort((x, y) => x - y).map((m) => <option key={m} value={m}>{durLabel(m)}</option>)}
                    </select>
                  </label>
                  {isManager && (
                    <label className="f check full"><input type="checkbox" checked={mv.outside} onChange={(e) => setMv({ ...mv, outside: e.target.checked })} />Allow outside the artist&apos;s shift</label>
                  )}
                </div>
                <button className="btn" type="submit" style={{ marginTop: 12 }} disabled={busy}>Save new time</button>
              </form>
            )}
          </>
        )}

        {error && <p className="err" style={{ marginBottom: 12 }} role="alert">{error}</p>}

        <h2>History</h2>
        <div className="timeline">
          {b.events.map((ev) => (
            <div key={ev.id}>
              <span className="muted small">{new Date(ev.at).toLocaleString('en-GB', { timeZone: ctx.tz, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>{' '}
              {ev.type === 'created' && <>Created{ev.toStatus ? ` as ${STATUS_LABEL[ev.toStatus].toLowerCase()}` : ''}</>}
              {ev.type === 'status' && <>{ev.fromStatus ? STATUS_LABEL[ev.fromStatus] : ''} → <strong>{ev.toStatus ? STATUS_LABEL[ev.toStatus] : ''}</strong></>}
              {ev.type === 'rescheduled' && <>Rescheduled</>}
              {ev.type === 'updated' && <>Details updated</>}
              {ev.user && <span className="muted small"> · {ev.user.name}</span>}
              {ev.note && ev.type !== 'rescheduled' && <span className="muted small"> · {ev.note}</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Today's date in the outlet + n days (for presets). */
export const outletDay = (tz: string, plus = 0) => addDays(dateKey(new Date(), tz), plus);
