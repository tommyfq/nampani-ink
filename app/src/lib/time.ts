/** Time helpers for an outlet's timezone (e.g. Asia/Makassar, UTC+8). */

/** "+08:00" for the zone at that moment. */
export function tzOffset(tz: string, at = new Date()): string {
  const part = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longOffset' })
    .formatToParts(at)
    .find((p) => p.type === 'timeZoneName')?.value;
  const m = part?.match(/GMT([+-]\d{2}):?(\d{2})?/);
  return m ? `${m[1]}:${m[2] ?? '00'}` : '+00:00';
}

/** "2026-11-21" — the calendar date in the zone. */
export function dateKey(at: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
}

/** ISO instant for a local date + "HH:MM" in the zone. "24:00" means the end of that day. */
export function toInstant(key: string, hhmm: string, tz: string): Date {
  if (hhmm === '24:00') return new Date(+toInstant(key, '00:00', tz) + 864e5);
  const guess = new Date(`${key}T${hhmm}:00Z`);
  return new Date(`${key}T${hhmm}:00${tzOffset(tz, guess)}`);
}

export function addDays(key: string, days: number): string {
  const d = new Date(`${key}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** 0 = Sunday … 6 = Saturday. */
export const weekdayOf = (key: string) => new Date(`${key}T12:00:00Z`).getUTCDay();

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function dayLabel(key: string) {
  const d = new Date(`${key}T12:00:00Z`);
  return {
    weekday: d.toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' }),
    day: d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }),
  };
}

export const hh = (h: number) => `${String(h).padStart(2, '0')}:00`;
export const minutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

/** "Saturday, 21 November 2026" */
export const longDate = (key: string) =>
  new Date(`${key}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
