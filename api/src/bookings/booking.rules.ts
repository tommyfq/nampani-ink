import { BookingStatus, Role } from '@prisma/client';

/**
 * Normalises a phone number to digits with country code.
 * Indonesian local numbers (08…, 8…) become 628…; "+61 4…" becomes 614….
 * Returns null when it does not look like a phone number.
 */
export function normalizePhone(raw: string): string | null {
  let d = raw.replace(/[^\d+]/g, '');
  if (d.startsWith('+')) d = d.slice(1);
  else if (d.startsWith('00')) d = d.slice(2);
  else if (d.startsWith('0')) d = `62${d.slice(1)}`;
  else if (d.startsWith('8') && d.length >= 9 && d.length <= 13) d = `62${d}`;
  d = d.replace(/\D/g, '');
  return /^\d{8,15}$/.test(d) ? d : null;
}

/** Statuses a booking may move to from its current status. */
export const TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  REQUESTED: ['BOOKED', 'CANCELLED'],
  BOOKED: ['CONFIRMED', 'CHECKED_IN', 'CANCELLED', 'NO_SHOW'],
  CONFIRMED: ['CHECKED_IN', 'CANCELLED', 'NO_SHOW'],
  CHECKED_IN: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: ['BOOKED'], // reopen (owner / manager)
  NO_SHOW: ['BOOKED'], // reopen (owner / manager)
};

export const REOPEN_ROLES: Role[] = ['OWNER', 'MANAGER'];
export const ACTIVE_STATUSES: BookingStatus[] = ['BOOKED', 'CONFIRMED', 'CHECKED_IN', 'COMPLETED'];

/** Local date, weekday and HH:MM of an instant in a timezone. */
export function localParts(at: Date, tz: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      weekday: 'short',
      hourCycle: 'h23',
    })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  );
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday);
  return { date: `${parts.year}-${parts.month}-${parts.day}`, weekday, hhmm: `${parts.hour}:${parts.minute}` };
}

/** "+08:00" offset of a timezone at an instant. */
export function tzOffset(tz: string, at: Date): string {
  const v = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longOffset' }).formatToParts(at).find((p) => p.type === 'timeZoneName')?.value ?? '';
  const m = v.match(/GMT([+-]\d{2}):?(\d{2})?/);
  return m ? `${m[1]}:${m[2] ?? '00'}` : '+00:00';
}

/** Instant for a local date (YYYY-MM-DD) and HH:MM in a timezone. */
export function zonedInstant(date: string, hhmm: string, tz: string): Date {
  return new Date(`${date}T${hhmm}:00${tzOffset(tz, new Date(`${date}T${hhmm}:00Z`))}`);
}

/**
 * When a reminder should be sent: `hoursBefore` the start, moved inside the send window
 * (too early → 20:00 the evening before; too late → 20:00 the same day).
 */
export function reminderDueAt(start: Date, tz: string, hoursBefore: number, windowStart: string, windowEnd: string): Date {
  const due = new Date(+start - hoursBefore * 3600_000);
  const p = localParts(due, tz);
  if (p.hhmm < windowStart) {
    const prev = new Date(+zonedInstant(p.date, '12:00', tz) - 864e5);
    return zonedInstant(localParts(prev, tz).date, windowEnd, tz);
  }
  if (p.hhmm > windowEnd) return zonedInstant(p.date, windowEnd, tz);
  return due;
}

/** "Rp1.500.000" */
export const rupiah = (n: bigint | number) => `Rp${Number(n).toLocaleString('id-ID')}`;
