'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { Artist, Branch, Style, Studio } from '@/lib/types';
import { waLink } from '@/lib/whatsapp';

export const PREFILL_EVENT = 'booking:prefill';
export type Prefill = { branch?: string; artist?: string; style?: string; placement?: string; size?: string; design?: string };

const MAX_FILES = 3;
const MAX_MB = 10;
// Static GitHub Pages build has no API: the request goes by WhatsApp only and photos are sent in the chat.
const CAN_UPLOAD = process.env.NEXT_PUBLIC_STATIC_EXPORT !== '1';
const CAN_SAVE = CAN_UPLOAD;

type Ref = { file: File; url: string };

type Props = {
  studio: Pick<Studio, 'name' | 'whatsapp' | 'email' | 'hoursNote'>;
  branches: Branch[];
  artists: Artist[];
  styles: Style[];
  defaults?: Prefill;
};

/**
 * Booking request form. On submit it uploads any reference photos, saves the
 * request in the studio system (staff get a notification in the POS inbox) and
 * offers WhatsApp with the request code for a faster reply.
 */
export function BookingForm({ studio, branches, artists, styles, defaults = {} }: Props) {
  const [values, setValues] = useState({
    name: '', phone: '', email: '', website: '', branch: defaults.branch ?? '', artist: defaults.artist ?? '', style: defaults.style ?? '',
    date: '', placement: defaults.placement ?? '', size: defaults.size ?? '', message: '', design: defaults.design ?? '',
  });
  const [refs, setRefs] = useState<Ref[]>([]);
  const [error, setError] = useState('');
  const [invalid, setInvalid] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [sendHref, setSendHref] = useState<string | null>(null);
  const [news, setNews] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);
  const [today, setToday] = useState('');
  const refsRef = useRef<Ref[]>([]);
  refsRef.current = refs;

  useEffect(() => setToday(new Date().toISOString().slice(0, 10)), []);
  useEffect(() => () => refsRef.current.forEach((r) => URL.revokeObjectURL(r.url)), []);

  // The gallery's "Customise in booking form" button fills the form.
  useEffect(() => {
    const onPrefill = (e: Event) => {
      const d = (e as CustomEvent<Prefill>).detail;
      setValues((v) => ({ ...v, branch: d.branch ?? '', artist: d.artist ?? '', style: d.style ?? '', placement: d.placement ?? '', size: d.size ?? '', design: d.design ?? '' }));
    };
    window.addEventListener(PREFILL_EVENT, onPrefill);
    return () => window.removeEventListener(PREFILL_EVENT, onPrefill);
  }, []);

  const set = (k: keyof typeof values) => (e: { target: { value: string } }) => {
    const value = e.target.value;
    setInvalid((list) => list.filter((x) => x !== k));
    setValues((v) => {
      const next = { ...v, [k]: value };
      if (k === 'artist') {
        const a = artists.find((x) => x.id === value);
        if (a) next.branch = a.branch;
      }
      if (k === 'branch' && next.artist && artists.find((x) => x.id === next.artist)?.branch !== value) next.artist = '';
      return next;
    });
  };

  const artistOptions = artists.filter((a) => !values.branch || a.branch === values.branch);

  function addFiles(list: FileList | null) {
    setError('');
    if (!list) return;
    const next = [...refs];
    for (const file of Array.from(list)) {
      if (!file.type.startsWith('image/')) continue;
      if (file.size > MAX_MB * 1024 * 1024) { setError(`${file.name} is larger than ${MAX_MB} MB.`); continue; }
      if (next.length >= MAX_FILES) { setError(`You can add up to ${MAX_FILES} photos.`); break; }
      next.push({ file, url: URL.createObjectURL(file) });
    }
    setRefs(next);
  }
  function removeFile(i: number) {
    URL.revokeObjectURL(refs[i].url);
    setRefs(refs.filter((_, j) => j !== i));
  }

  async function uploadRefs(): Promise<string[]> {
    if (!refs.length) return [];
    const body = new FormData();
    refs.forEach((r) => body.append('files', r.file));
    const res = await fetch('/api/uploads', { method: 'POST', body });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.message || 'Upload failed');
    return (data.files as { path: string }[]).map((f) => f.path);
  }

  /** Saves the request in the studio system. Returns the booking code, or throws with a readable message. */
  async function saveRequest(photos: string[]): Promise<string | null> {
    const res = await fetch('/api/requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studio: values.branch, artist: values.artist, style: values.style, name: values.name, phone: values.phone,
        email: values.email, preferredDate: values.date, placement: values.placement, size: values.size,
        idea: values.message, design: values.design, photos, newsOptIn: news, website: values.website,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const issue = data?.issues?.[0];
      const err = new Error(issue?.message || (res.status === 429 ? 'Too many requests, please try again in a few minutes.' : data?.message || 'Could not send'));
      (err as Error & { field?: string }).field = issue?.path;
      throw err;
    }
    return data.code ?? null;
  }

  function buildMessage(photoLinks: string[], requestCode: string | null) {
    const b = branches.find((x) => x.id === values.branch)!;
    const a = artists.find((x) => x.id === values.artist);
    const s = styles.find((x) => x.id === values.style);
    const lines = [`Hi ${studio.name} ${b.name}! I'd like to book a tattoo.`, ''];
    const add = (k: string, v?: string) => v && lines.push(`*${k}:* ${v}`);
    if (requestCode) add('Request code', requestCode);
    add('Name', values.name);
    add('WhatsApp', values.phone);
    add('Studio', b.name);
    add('Artist', a ? a.name : 'Any available');
    add('Style', s ? s.name : 'Not sure yet');
    add('Placement', values.placement);
    add('Size', values.size);
    if (values.date) add('Preferred date', new Date(`${values.date}T00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }));
    add('Gallery design', values.design);
    if (values.message) lines.push('', '*My idea:*', values.message);
    if (photoLinks.length) lines.push('', '*Reference photos:*', ...photoLinks);
    return lines.join('\n');
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    const missing = (['name', 'phone', 'branch'] as const).filter((k) => !values[k].trim());
    setInvalid(missing);
    if (missing.length) {
      setError('Please fill in your name, WhatsApp number and studio.');
      document.getElementById(`f-${missing[0]}`)?.focus();
      return;
    }
    setBusy(true);
    let paths: string[] = [];
    try {
      paths = await uploadRefs();
    } catch (err) {
      setError(`We couldn't upload your photos (${(err as Error).message}). Remove them and try again, or send them in the WhatsApp chat.`);
      setBusy(false);
      return;
    }
    let saved: string | null = null;
    let failed = false;
    if (CAN_SAVE) {
      try {
        saved = await saveRequest(paths);
      } catch (err) {
        const field = (err as Error & { field?: string }).field;
        // A mistake the customer can fix: show it on the form. Anything else: WhatsApp still works.
        if (field && ['phone', 'email', 'name', 'studio'].includes(field)) {
          setError((err as Error).message);
          setInvalid([field === 'studio' ? 'branch' : field]);
          document.getElementById(`f-${field === 'studio' ? 'branch' : field}`)?.focus();
          setBusy(false);
          return;
        }
        failed = true;
      }
    }
    const b = branches.find((x) => x.id === values.branch)!;
    const links = paths.map((p) => new URL(p, window.location.origin).href);
    setCode(saved);
    setSaveFailed(failed);
    setSendHref(waLink(b.whatsapp, buildMessage(links, saved)));
    setBusy(false);
  }

  function closeSent() {
    setSendHref(null);
    if (code) {
      // Saved: clear the form so the same request isn't sent twice.
      refs.forEach((r) => URL.revokeObjectURL(r.url));
      setRefs([]);
      setValues((v) => ({ ...v, message: '', placement: '', size: '', date: '', design: '' }));
      setCode(null);
    }
  }

  const bad = (k: string) => (invalid.includes(k) ? { 'aria-invalid': true as const } : {});
  const branchName = branches.find((b) => b.id === values.branch)?.name;

  return (
    <section className="section alt" id="book" aria-labelledby="book-title">
      <div className="wrap book">
      <div className="book-intro">
        <p className="label">Book a session</p>
        <h2 id="book-title">Tell us what you want to carry.</h2>
        <p>
          {CAN_SAVE
            ? 'Send your request and the studio will reply on WhatsApp. For a faster answer you can also open the chat with everything filled in.'
            : 'Fill this in and it opens WhatsApp with everything ready to send to the studio you choose. Send your reference photos in the chat.'}
        </p>
        <ul className="contact-list">
          <li><strong>WhatsApp</strong><a href={waLink(studio.whatsapp, `Hi ${studio.name}!`)} target="_blank" rel="noopener">+{studio.whatsapp}</a></li>
          <li><strong>Email</strong><a href={`mailto:${studio.email}`}>{studio.email}</a></li>
          <li><strong>Hours</strong>{studio.hoursNote}</li>
        </ul>
      </div>

      <form className="book-form" onSubmit={onSubmit} noValidate>
        <div className="field"><label htmlFor="f-name">Name*</label><input id="f-name" name="name" autoComplete="name" required value={values.name} onChange={set('name')} {...bad('name')} /></div>
        <div className="field"><label htmlFor="f-phone">WhatsApp number*</label><input id="f-phone" name="phone" type="tel" autoComplete="tel" placeholder="+62… or +61…" required value={values.phone} onChange={set('phone')} {...bad('phone')} /></div>
        {CAN_SAVE && (
          <div className="field"><label htmlFor="f-email">Email</label><input id="f-email" name="email" type="email" autoComplete="email" placeholder="For your confirmation and receipts" value={values.email} onChange={set('email')} {...bad('email')} /></div>
        )}
        {/* Honeypot for bots: hidden from people and screen readers. */}
        <div className="hp" aria-hidden="true"><label htmlFor="f-website">Website</label><input id="f-website" name="website" tabIndex={-1} autoComplete="off" value={values.website} onChange={set('website')} /></div>
        <div className="field">
          <label htmlFor="f-branch">Studio*</label>
          <select id="f-branch" name="branch" required value={values.branch} onChange={set('branch')} {...bad('branch')}>
            <option value="">Choose a studio</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name} — {b.area}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="f-artist">Artist</label>
          <select id="f-artist" name="artist" value={values.artist} onChange={set('artist')}>
            <option value="">Any available artist</option>
            {artistOptions.map((a) => <option key={a.id} value={a.id}>{a.name} — {a.role}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="f-style">Style</label>
          <select id="f-style" name="style" value={values.style} onChange={set('style')}>
            <option value="">Not sure yet</option>
            {styles.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div className="field"><label htmlFor="f-date">Preferred date</label><input id="f-date" name="date" type="date" min={today || undefined} value={values.date} onChange={set('date')} /></div>
        <div className="field"><label htmlFor="f-placement">Placement</label><input id="f-placement" name="placement" placeholder="e.g. inner forearm" value={values.placement} onChange={set('placement')} /></div>
        <div className="field"><label htmlFor="f-size">Approx. size</label><input id="f-size" name="size" placeholder="e.g. 8 cm" value={values.size} onChange={set('size')} /></div>
        <div className="field full"><label htmlFor="f-message">Your idea</label><textarea id="f-message" name="message" rows={4} placeholder="Describe the tattoo, meaning, colour or black & grey…" value={values.message} onChange={set('message')} /></div>
        {CAN_UPLOAD && (
        <div className="field full">
          <label htmlFor="f-ref">Reference photos</label>
          <label className="upload" htmlFor="f-ref">
            <input id="f-ref" type="file" accept="image/*" multiple onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
            <span className="upload-cta">＋ Add reference photos</span>
            <span className="upload-hint">JPG, PNG, WEBP or HEIC · up to {MAX_FILES} photos, {MAX_MB} MB each</span>
          </label>
          {refs.length > 0 && (
            <div className="thumbs">
              {refs.map((r, i) => (
                <div className="thumb" key={r.url}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={r.url} alt={`Reference ${i + 1}`} />
                  <button type="button" aria-label="Remove photo" onClick={() => removeFile(i)}>✕</button>
                </div>
              ))}
            </div>
          )}
        </div>
        )}
        {!CAN_UPLOAD && (
          <p className="field full upload-hint">Have reference photos? Attach them in the WhatsApp chat after you press send.</p>
        )}
        {values.design && (
          <div className="field full design-chip">
            <span>Design from gallery: <strong>{values.design}</strong></span>
            <button type="button" onClick={() => setValues((v) => ({ ...v, design: '' }))}>Remove</button>
          </div>
        )}
        {CAN_SAVE && (
          <label className="field full check">
            <input type="checkbox" checked={news} onChange={(e) => setNews(e.target.checked)} />
            <span>Send me news and flash tattoo offers from {studio.name}. You can unsubscribe at any time.</span>
          </label>
        )}
        {error && <p className="form-error full" role="alert">{error}</p>}
        <button className="btn btn-sogan full" type="submit" disabled={busy}>{busy ? 'Sending…' : CAN_SAVE ? 'Send request' : 'Send via WhatsApp'}</button>
      </form>

      {sendHref && (
        <div className="lightbox" role="dialog" aria-modal="true" aria-labelledby="send-title" onClick={(e) => e.target === e.currentTarget && closeSent()}>
          <div className="lb-card sheet">
            <button className="lb-close" aria-label="Close" onClick={closeSent} autoFocus>✕</button>
            {code ? (
              <>
                <p className="label">Request sent</p>
                <h3 id="send-title">Thank you, {values.name.split(' ')[0]}.</h3>
                <ol className="send-steps">
                  <li>
                    <strong>Your request code: {code}</strong>
                    <p>{branchName} has your request and will reply on WhatsApp.</p>
                  </li>
                  <li>
                    <strong>Want a faster answer?</strong>
                    <p>Open the chat with your details and code already filled in.</p>
                    <a className="btn btn-line" href={sendHref} target="_blank" rel="noopener">Open WhatsApp</a>
                  </li>
                </ol>
              </>
            ) : (
              <>
                <p className="label">Almost done</p>
                <h3 id="send-title">Send your request to {branchName}</h3>
                <ol className="send-steps">
                  <li>
                    <strong>Open the chat with your details</strong>
                    <p>
                      {saveFailed ? 'We couldn\'t save your request online just now, so please send it on WhatsApp. ' : ''}
                      Your message{refs.length ? ' and photo links are' : ' is'} ready — just press send in WhatsApp.
                    </p>
                    <a className="btn btn-sogan" href={sendHref} target="_blank" rel="noopener">Open WhatsApp</a>
                  </li>
                </ol>
              </>
            )}
          </div>
        </div>
      )}
      </div>
    </section>
  );
}
