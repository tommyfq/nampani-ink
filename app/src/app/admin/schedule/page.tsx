'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useMe } from '@/components/Session';
import { api, ApiError } from '@/lib/api';
import { addDays, dateKey, dayLabel, hh, longDate, minutes, toInstant, weekdayOf, WEEKDAYS } from '@/lib/time';
import { Booking, BookingDrawer, Ctx, KIND_LABEL, NewBookingDrawer, STATUS_LABEL } from '@/components/BookingDrawers';

interface Shift { id?: string; outletId: string; weekday: number; startTime: string; endTime: string }
interface TimeOff { id: string; type: 'LEAVE' | 'GUEST_SPOT' | 'BLOCKED'; startsAt: string; endsAt: string; note: string }
interface Artist { id: string; displayName: string; role: string; userId: string | null; shifts: Shift[]; timeOff: TimeOff[] }
interface Data {
  outlet: { id: string; name: string; timezone: string; opens: string; closes: string };
  outlets: { id: string; name: string; code: string }[];
  styles: { id: string; name: string }[];
  artists: Artist[];
  bookings: Booking[];
  canEdit: boolean;
  canBook: boolean;
}

const TYPE_LABEL: Record<TimeOff['type'], string> = { LEAVE: 'Leave', GUEST_SPOT: 'Guest spot', BLOCKED: 'Blocked' };

type Cell =
  | { kind: 'booked'; booking: Booking; first: boolean }
  | { kind: 'work'; label?: string }
  | { kind: 'elsewhere'; label: string }
  | { kind: 'timeoff'; label: string; item: TimeOff }
  | { kind: 'off' };

export default function SchedulePage() {
  const me = useMe()!;
  const [outlets, setOutlets] = useState<{ id: string; name: string; code: string }[] | null>(null);
  const [outletId, setOutletId] = useState('');
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(''); // date key
  const [shiftFor, setShiftFor] = useState<Artist | null>(null);
  const [offFor, setOffFor] = useState<{ artist: Artist; key: string; hour: number } | null>(null);
  const [newFor, setNewFor] = useState<Parameters<typeof NewBookingDrawer>[0]['preset'] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    api<{ id: string; name: string; code: string }[]>('/admin/outlets')
      .then((list) => {
        setOutlets(list);
        const saved = typeof window !== 'undefined' ? localStorage.getItem('npi.outlet') : null;
        setOutletId(list.find((o) => o.id === saved)?.id ?? list[0]?.id ?? '');
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Could not load outlets'));
  }, []);

  const tz = data?.outlet.timezone ?? 'Asia/Makassar';
  const today = dateKey(new Date(), tz);
  const day = selected || today;

  const load = useCallback(async () => {
    if (!outletId) return;
    try {
      localStorage.setItem('npi.outlet', outletId);
    } catch {
      /* private mode */
    }
    const from = toInstant(day, '00:00', tz).toISOString();
    const to = toInstant(addDays(day, 1), '00:00', tz).toISOString();
    try {
      setData(await api<Data>(`/pos/schedule?outletId=${outletId}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`));
      setError('');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load the schedule');
    }
  }, [outletId, day, tz]);

  useEffect(() => {
    load();
  }, [load]);

  const hours = useMemo(() => {
    if (!data) return [];
    const start = Math.floor(minutes(data.outlet.opens) / 60);
    const end = Math.ceil(minutes(data.outlet.closes) / 60);
    return Array.from({ length: Math.max(end - start, 1) }, (_, i) => start + i);
  }, [data]);

  function cell(a: Artist, key: string, hour: number): Cell {
    const from = toInstant(key, hh(hour), tz);
    const to = toInstant(key, hour + 1 >= 24 ? '24:00' : hh(hour + 1), tz);
    const bk = data!.bookings.find((b) => b.artistId === a.id && b.startsAt && b.endsAt && new Date(b.startsAt) < to && new Date(b.endsAt) > from);
    if (bk) return { kind: 'booked', booking: bk, first: new Date(bk.startsAt!) >= from || hour === hours[0] };
    const off = a.timeOff.find((t) => new Date(t.startsAt) < to && new Date(t.endsAt) > from);
    if (off) return { kind: 'timeoff', label: TYPE_LABEL[off.type], item: off };
    const wd = weekdayOf(key);
    const overlaps = (s: Shift) => minutes(s.startTime) < (hour + 1) * 60 && minutes(s.endTime) > hour * 60;
    const here = a.shifts.find((s) => s.weekday === wd && s.outletId === data!.outlet.id && overlaps(s));
    if (here) return { kind: 'work', label: Math.floor(minutes(here.startTime) / 60) === hour ? `${here.startTime}–${here.endTime}` : undefined };
    const there = a.shifts.find((s) => s.weekday === wd && overlaps(s));
    if (there) return { kind: 'elsewhere', label: `At ${data!.outlets.find((o) => o.id === there.outletId)?.code ?? 'other'}` };
    return { kind: 'off' };
  }

  return (
    <>
      <div className="head">
        <div>
          <h1>Schedule</h1>
          <p className="muted">
            {data?.canEdit
              ? 'Tap a free time to book. Tap an artist to set their weekly shift, or an off time to add leave.'
              : data?.canBook
                ? 'Tap a free time to book, or a booking to see it.'
                : 'Your studio schedule and bookings.'}
          </p>
        </div>
        {outlets && outlets.length > 0 && (
          <label className="f" style={{ minWidth: 200 }}>
            Outlet
            <select value={outletId} onChange={(e) => setOutletId(e.target.value)}>
              {outlets.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </label>
        )}
      </div>

      {error && <p className="err" role="alert">{error}</p>}
      {outlets && outlets.length === 0 && <div className="card muted">You are not assigned to an outlet yet. Ask an owner to add you.</div>}

      {data && (
        <div className="sched">
          <div className="datebar">
            <button className="btn line" onClick={() => setSelected(addDays(day, -1))} aria-label="Previous day">‹</button>
            <input
              type="date"
              className="datepick"
              value={day}
              aria-label="Choose a date"
              onChange={(e) => e.target.value && setSelected(e.target.value)}
            />
            <button className="btn line" onClick={() => setSelected(addDays(day, 1))} aria-label="Next day">›</button>
            <button className="btn line" onClick={() => setSelected(today)} disabled={day === today}>Today</button>
            <strong className={`dlabel${weekdayOf(day) === 0 ? ' sun' : ''}`}>{longDate(day)}</strong>
          </div>

          {data.artists.length === 0 ? (
            <div className="card muted" style={{ marginTop: 12 }}>
              No artists at this outlet yet. Set an artist&apos;s home outlet in Artists, or give them a shift here.
            </div>
          ) : (
            <div className="grid-wrap">
              <table className="sgrid" style={{ minWidth: 72 + data.artists.length * 130 }}>
                <thead>
                  <tr>
                    <th className="tcol" />
                    {data.artists.map((a) => {
                      const mine = a.userId === me.id;
                      return (
                        <th key={a.id} className={mine ? 'mine' : ''}>
                          {data.canEdit ? (
                            <button className="ahead" onClick={() => setShiftFor(a)} title="Edit weekly shift">
                              {a.displayName} ›
                            </button>
                          ) : (
                            <span className="ahead">{a.displayName}{mine ? ' (you)' : ''}</span>
                          )}
                          <span className="arole">{a.role}</span>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {hours.map((h) => (
                    <tr key={h}>
                      <td className="tcol">{hh(h)}</td>
                      {data.artists.map((a) => {
                        const c = cell(a, day, h);
                        const content =
                          c.kind === 'booked' ? (
                            c.first ? (
                              <>
                                <span className="price">{c.booking.customer.name}</span>
                                <span className="sub">
                                  {KIND_LABEL[c.booking.kind]} · {STATUS_LABEL[c.booking.status]}
                                </span>
                              </>
                            ) : (
                              <span className="sub">{c.booking.customer.name} (cont.)</span>
                            )
                          ) : c.kind === 'work' ? (
                            <><span className="price">Available</span>{c.label && <span className="sub">{c.label}</span>}</>
                          ) : c.kind === 'timeoff' ? (
                            <><span className="price">{c.label}</span>{c.item.note && <span className="sub">{c.item.note}</span>}</>
                          ) : c.kind === 'elsewhere' ? (
                            <span className="sub">{c.label}</span>
                          ) : (
                            <span className="sub">Off</span>
                          );
                        return (
                          <td key={a.id} className={`slot ${c.kind}${c.kind === 'booked' ? ` st-${c.booking.status}` : ''}`}>
                            {(() => {
                              const onClick =
                                c.kind === 'booked'
                                  ? () => setOpenId(c.booking.id)
                                  : c.kind === 'work' && data.canBook
                                    ? () => setNewFor({ artistId: a.id, day, time: hh(h) })
                                    : data.canEdit
                                      ? () => setOffFor({ artist: a, key: day, hour: h })
                                      : null;
                              return onClick ? (
                                <button className="slotbtn" onClick={onClick} aria-label={`${a.displayName} ${hh(h)}`}>
                                  {content}
                                </button>
                              ) : (
                                <div className="slotbtn">{content}</div>
                              );
                            })()}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="legend small">
            <span><i className="sw booked" /> Booked</span>
            <span><i className="sw work" /> Available</span>
            <span><i className="sw timeoff" /> Leave / blocked</span>
            <span><i className="sw elsewhere" /> At another outlet</span>
            <span><i className="sw off" /> Off</span>
          </div>
        </div>
      )}

      {shiftFor && data && (
        <ShiftEditor artist={shiftFor} data={data} onClose={() => setShiftFor(null)} onSaved={() => { setShiftFor(null); load(); }} />
      )}
      {offFor && data && (
        <TimeOffEditor
          artist={offFor.artist}
          day={offFor.key}
          hour={offFor.hour}
          tz={tz}
          onClose={() => setOffFor(null)}
          onSaved={() => { setOffFor(null); load(); }}
          onBookOutside={() => { setNewFor({ artistId: offFor.artist.id, day: offFor.key, time: hh(offFor.hour), outsideShift: true }); setOffFor(null); }}
        />
      )}
      {data && newFor && (
        <NewBookingDrawer
          ctx={ctxOf(data, me.role)}
          preset={newFor}
          onClose={() => setNewFor(null)}
          onSaved={(b) => { setNewFor(null); load(); setOpenId(b.id); }}
        />
      )}
      {data && openId && (
        <BookingDrawer
          id={openId}
          ctx={ctxOf(data, me.role)}
          onClose={() => setOpenId(null)}
          onChanged={load}
          onFollowUp={(b) => {
            setOpenId(null);
            setNewFor({ artistId: b.artistId ?? data.artists[0]?.id ?? '', day, time: '12:00', kind: 'TATTOO', customer: b.customer, parentId: b.id });
          }}
        />
      )}
    </>
  );
}

function ctxOf(data: Data, role: Ctx['role']): Ctx {
  return { outletId: data.outlet.id, tz: data.outlet.timezone, role, artists: data.artists, styles: data.styles };
}

function ShiftEditor({ artist, data, onClose, onSaved }: { artist: Artist; data: Data; onClose: () => void; onSaved: () => void }) {
  const [rows, setRows] = useState(() =>
    WEEKDAYS.map((_, wd) => {
      const s = artist.shifts.find((x) => x.weekday === wd);
      return { on: Boolean(s), outletId: s?.outletId ?? data.outlet.id, startTime: s?.startTime ?? data.outlet.opens, endTime: s?.endTime ?? data.outlet.closes };
    }),
  );
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (i: number, patch: Partial<(typeof rows)[number]>) => {
    setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));
    setError('');
  };

  async function save(e: FormEvent) {
    e.preventDefault();
    const re = /^([01]\d|2[0-3]):[0-5]\d$/;
    const bad = rows.findIndex((r) => r.on && (!re.test(r.startTime) || !re.test(r.endTime) || r.startTime >= r.endTime));
    if (bad >= 0) {
      setError(`${WEEKDAYS[bad]}: use HH:MM and make the end later than the start`);
      return;
    }
    setBusy(true);
    try {
      await api(`/admin/artists/${artist.id}/shifts`, {
        method: 'PUT',
        body: { shifts: rows.flatMap((r, weekday) => (r.on ? [{ outletId: r.outletId, weekday, startTime: r.startTime, endTime: r.endTime }] : [])) },
      });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.issues[0]?.message ?? err.message : 'Could not save');
      setBusy(false);
    }
  }

  return (
    <div className="drawer-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="drawer" onSubmit={save} noValidate>
        <div className="head">
          <div>
            <h2 style={{ marginBottom: 2 }}>{artist.displayName}: weekly shift</h2>
            <p className="muted small">Repeats every week. Use leave for single days off.</p>
          </div>
          <button type="button" className="btn line" onClick={onClose}>Close</button>
        </div>
        <table>
          <thead>
            <tr><th>Day</th><th>Works</th><th>Outlet</th><th>From</th><th>To</th></tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td>{WEEKDAYS[i]}</td>
                <td><input type="checkbox" checked={r.on} onChange={(e) => set(i, { on: e.target.checked })} aria-label={`Works on ${WEEKDAYS[i]}`} /></td>
                <td>
                  <select value={r.outletId} disabled={!r.on} onChange={(e) => set(i, { outletId: e.target.value })}>
                    {data.outlets.map((o) => <option key={o.id} value={o.id}>{o.code}</option>)}
                  </select>
                </td>
                <td><input value={r.startTime} disabled={!r.on} inputMode="numeric" onChange={(e) => set(i, { startTime: e.target.value })} style={{ width: 80 }} /></td>
                <td><input value={r.endTime} disabled={!r.on} inputMode="numeric" onChange={(e) => set(i, { endTime: e.target.value })} style={{ width: 80 }} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="row" style={{ marginTop: 10 }}>
          <button type="button" className="btn line" onClick={() => setRows((r) => r.map((x) => ({ ...x, on: true, outletId: data.outlet.id, startTime: data.outlet.opens, endTime: data.outlet.closes })))}>
            Every day, opening hours
          </button>
          <button type="button" className="btn line" onClick={() => setRows((r) => r.map((x) => ({ ...x, on: false })))}>Clear</button>
        </div>
        {error && <p className="err" style={{ marginTop: 12 }} role="alert">{error}</p>}
        <button className="btn" type="submit" style={{ marginTop: 16 }} disabled={busy}>{busy ? 'Saving…' : 'Save shift'}</button>
      </form>
    </div>
  );
}

function TimeOffEditor({ artist, day: dayKey, hour, tz, onClose, onSaved, onBookOutside }: { artist: Artist; day: string; hour: number; tz: string; onClose: () => void; onSaved: () => void; onBookOutside: () => void }) {
  const [type, setType] = useState<TimeOff['type']>('LEAVE');
  const [wholeDay, setWholeDay] = useState(true);
  const [from, setFrom] = useState(hh(hour));
  const [to, setTo] = useState(hour + 1 >= 24 ? '23:59' : hh(hour + 1));
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const dayStart = toInstant(dayKey, '00:00', tz);
  const dayEnd = toInstant(dayKey, '24:00', tz);
  const existing = artist.timeOff.filter((t) => new Date(t.startsAt) < dayEnd && new Date(t.endsAt) > dayStart);
  const l = dayLabel(dayKey);
  const fmt = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: tz });

  async function save(e: FormEvent) {
    e.preventDefault();
    const re = /^([01]\d|2[0-3]):[0-5]\d$/;
    if (!wholeDay && (!re.test(from) || !re.test(to) || from >= to)) {
      setError('Use HH:MM and make the end later than the start');
      return;
    }
    setBusy(true);
    try {
      await api(`/admin/artists/${artist.id}/time-off`, {
        method: 'POST',
        body: {
          type,
          note,
          startsAt: (wholeDay ? dayStart : toInstant(dayKey, from, tz)).toISOString(),
          endsAt: (wholeDay ? dayEnd : toInstant(dayKey, to, tz)).toISOString(),
        },
      });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.issues[0]?.message ?? err.message : 'Could not save');
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!confirm('Remove this leave / block?')) return;
    setBusy(true);
    try {
      await api(`/admin/time-off/${id}`, { method: 'DELETE' });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not remove');
      setBusy(false);
    }
  }

  return (
    <div className="drawer-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="drawer" onSubmit={save} noValidate>
        <div className="head">
          <div>
            <h2 style={{ marginBottom: 2 }}>{artist.displayName}</h2>
            <p className="muted small">{l.weekday} {l.day}</p>
          </div>
          <button type="button" className="btn line" onClick={onClose}>Close</button>
        </div>

        {existing.length > 0 && (
          <div className="card" style={{ marginBottom: 16 }}>
            <h2>This day</h2>
            {existing.map((t) => (
              <div key={t.id} className="row" style={{ padding: '6px 0', borderTop: '1px solid var(--line)' }}>
                <span>{TYPE_LABEL[t.type]} · {fmt(t.startsAt)}–{fmt(t.endsAt)}{t.note && ` · ${t.note}`}</span>
                <span className="spacer" />
                <button type="button" className="btn danger" onClick={() => remove(t.id)} disabled={busy}>Remove</button>
              </div>
            ))}
          </div>
        )}

        <h2>Add leave or block time</h2>
        <div className="form">
          <label className="f">
            Type
            <select value={type} onChange={(e) => setType(e.target.value as TimeOff['type'])}>
              <option value="LEAVE">Leave / day off</option>
              <option value="BLOCKED">Blocked (not bookable)</option>
              <option value="GUEST_SPOT">Guest spot elsewhere</option>
            </select>
          </label>
          <label className="f check" style={{ alignSelf: 'end' }}>
            <input type="checkbox" checked={wholeDay} onChange={(e) => setWholeDay(e.target.checked)} />
            Whole day
          </label>
          {!wholeDay && (
            <>
              <label className="f">From<input value={from} inputMode="numeric" onChange={(e) => { setFrom(e.target.value); setError(''); }} /></label>
              <label className="f">To<input value={to} inputMode="numeric" onChange={(e) => { setTo(e.target.value); setError(''); }} /></label>
            </>
          )}
          <label className="f full">Note (optional)<input value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Family ceremony" /></label>
        </div>
        {error && <p className="err" style={{ marginTop: 12 }} role="alert">{error}</p>}
        <div className="row" style={{ marginTop: 16 }}>
          <button className="btn" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
          <span className="spacer" />
          <button type="button" className="btn line" onClick={onBookOutside}>Book here anyway (outside shift)</button>
        </div>
      </form>
    </div>
  );
}
