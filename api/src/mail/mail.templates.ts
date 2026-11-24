/**
 * Email templates in the landing-page design (Nampani Ink colours and serif headings).
 * The owner edits the subject and the message text in Admin; the details box, buttons
 * and footer are added automatically so every email keeps the same look.
 */

export const EMAIL_TYPES = ['requestReceived', 'studioAlert', 'bookingConfirmed', 'dpReceipt', 'reminder', 'finalReceipt'] as const;
export type EmailType = (typeof EMAIL_TYPES)[number];

export interface EmailTemplate {
  subject: string;
  body: string;
}

export const EMAIL_INFO: Record<EmailType, { label: string; when: string; to: 'customer' | 'studio' }> = {
  requestReceived: { label: 'Request received', when: 'when a customer sends the booking form on the website', to: 'customer' },
  studioAlert: { label: 'New request alert (to the studio)', when: 'when a customer sends the booking form, to the studio inbox', to: 'studio' },
  bookingConfirmed: { label: 'Booking confirmed', when: 'when a consultation or tattoo is booked or moved to a new time', to: 'customer' },
  dpReceipt: { label: 'Deposit (DP) receipt', when: 'after the DP is recorded, with the receipt PDF', to: 'customer' },
  reminder: { label: 'Reminder', when: 'before a consultation or tattoo (same timing as WhatsApp reminders)', to: 'customer' },
  finalReceipt: { label: 'Final receipt', when: 'after the final payment, with the receipt PDF', to: 'customer' },
};

export const EMAIL_FIELDS = '{firstName} {name} {studio} {outlet} {kind} {day} {date} {time} {artist} {code} {address} {amount} {total} {remaining} {receiptNo}';

export const DEFAULT_TEMPLATES: Record<EmailType, EmailTemplate> = {
  requestReceived: {
    subject: 'We received your request ({code})',
    body:
      'Hi {firstName},\n\nThank you for your tattoo request at {studio} {outlet}. Your request code is {code}.\n\n' +
      'Our team will look at your idea and reply on WhatsApp soon, usually within a day, to book your free consultation.\n\n' +
      'Have more reference photos? Just reply to this email.',
  },
  studioAlert: {
    subject: 'New booking request {code} from {name}',
    body: 'A new booking request came in from the website. Schedule or decline it in the POS inbox.',
  },
  bookingConfirmed: {
    subject: 'Your {kind} on {date} is booked ({code})',
    body:
      'Hi {firstName},\n\nYour {kind} at {studio} {outlet} is booked. The details are below.\n\n' +
      'Please arrive 10 minutes early. Need to change the time? Reply to this email or message us on WhatsApp.',
  },
  dpReceipt: {
    subject: 'Deposit received, your tattoo is confirmed ({code})',
    body:
      'Hi {firstName},\n\nWe received your deposit of {amount}. Your tattoo session with {artist} is confirmed.\n\n' +
      'The remaining {remaining} is paid after your session. Your receipt {receiptNo} is attached.\n\n' +
      'Please note the deposit is not refundable if the booking is cancelled.',
  },
  reminder: {
    subject: 'See you {day} at {time} ({code})',
    body:
      'Hi {firstName},\n\nA friendly reminder of your {kind} at {studio} {outlet} on {day}, {date} at {time}.\n\n' +
      'Need to change the time? Reply to this email or message us on WhatsApp.',
  },
  finalReceipt: {
    subject: 'Thank you, {firstName}! Your receipt {receiptNo}',
    body:
      'Hi {firstName},\n\nThank you for getting tattooed at {studio} {outlet}! We received your payment of {amount}. Your receipt is attached.\n\n' +
      'Look after your new tattoo with the aftercare steps your artist gave you, and message us on WhatsApp if you have any questions while it heals.',
  },
};

export interface EmailParts {
  /** Shown in the inbox list after the subject. */
  preheader: string;
  heading: string;
  body: string; // filled-in template text
  details: [string, string][];
  buttons: { label: string; url: string }[];
  note?: string; // small boxed text, e.g. tattoo preparation
  studio: { name: string; outlet: string; address: string; whatsapp: string; email: string };
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function fill(template: string, v: Record<string, string>) {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in v ? v[k] : m));
}

/** Plain text → paragraphs (blank line) and line breaks. */
function paragraphs(text: string) {
  return text
    .trim()
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 16px;">${esc(p).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

const C = { bg: '#f1eadb', card: '#fbf8f1', box: '#e8decb', line: '#d8ccb6', ink: '#211f1c', text: '#665744', accent: '#795a43', soft: '#b5a58d' };
const SERIF = "'Cormorant Garamond', Georgia, 'Times New Roman', serif";
const SANS = "'Helvetica Neue', Helvetica, Arial, sans-serif";

/** Full HTML email: works in Gmail, Apple Mail and Outlook, on phones, and in dark mode. */
export function renderHtml(p: EmailParts) {
  const rows = p.details
    .filter(([, v]) => v)
    .map(
      ([k, v]) => `<tr>
          <td style="padding:8px 0;border-bottom:1px solid ${C.line};font:11px/1.4 ${SANS};letter-spacing:.14em;text-transform:uppercase;color:${C.accent};width:40%;vertical-align:top;">${esc(k)}</td>
          <td style="padding:8px 0;border-bottom:1px solid ${C.line};font:15px/1.4 ${SANS};color:${C.ink};vertical-align:top;" class="t-ink">${esc(v).replace(/\n/g, '<br>')}</td>
        </tr>`,
    )
    .join('');
  const buttons = p.buttons
    .map(
      (b, i) => `<a href="${esc(b.url)}" style="display:inline-block;margin:0 8px 8px 0;padding:12px 22px;font:500 12px/1 ${SANS};letter-spacing:.16em;text-transform:uppercase;text-decoration:none;border:1px solid ${C.accent};${
        i === 0 ? `background:${C.accent};color:#ffffff;` : `background:transparent;color:${C.accent};`
      }" class="${i === 0 ? 'btn' : 'btn-line'}">${esc(b.label)}</a>`,
    )
    .join('');
  const contact = [p.studio.whatsapp && `WhatsApp +${p.studio.whatsapp}`, p.studio.email].filter(Boolean).join(' · ');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${esc(p.heading)}</title>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500&display=swap" rel="stylesheet">
<style>
  body { margin:0; padding:0; }
  a { color:${C.accent}; }
  @media (max-width: 600px) { .card { padding:28px 20px !important; } .h1 { font-size:30px !important; } }
  @media (prefers-color-scheme: dark) {
    .page { background:#211f1c !important; }
    .card { background:#302c28 !important; }
    .box { background:#3a352f !important; }
    .t-ink, .h1, .brand { color:#f1eadb !important; }
    .t-text { color:#d8ccb6 !important; }
    .btn { background:#b5a58d !important; border-color:#b5a58d !important; color:#211f1c !important; }
    .btn-line { color:#b5a58d !important; border-color:#b5a58d !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:${C.bg};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(p.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="page" style="background:${C.bg};">
  <tr><td align="center" style="padding:32px 12px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
      <tr><td align="center" style="padding:0 0 22px;font:500 24px/1 ${SERIF};letter-spacing:.12em;color:${C.ink};" class="brand">${esc(p.studio.name.toUpperCase())}</td></tr>
      <tr><td class="card" style="background:${C.card};padding:40px 36px;border:1px solid ${C.line};">
        <div style="font:11px/1.4 ${SANS};letter-spacing:.16em;text-transform:uppercase;color:${C.accent};margin:0 0 10px;">${esc(p.studio.outlet)}</div>
        <h1 class="h1" style="margin:0 0 22px;font:500 34px/1.15 ${SERIF};color:${C.ink};">${esc(p.heading)}</h1>
        <div class="t-text" style="font:15px/1.65 ${SANS};color:${C.text};">${paragraphs(p.body)}</div>
        ${rows ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px;border-top:1px solid ${C.line};">${rows}</table>` : ''}
        ${p.note ? `<div class="box t-text" style="background:${C.box};padding:16px 18px;margin:0 0 24px;font:14px/1.6 ${SANS};color:${C.text};">${paragraphs(p.note).replace(/margin:0 0 16px;/g, 'margin:0 0 8px;')}</div>` : ''}
        ${buttons ? `<div style="margin:0 0 4px;">${buttons}</div>` : ''}
      </td></tr>
      <tr><td align="center" class="t-text" style="padding:22px 16px 0;font:12px/1.6 ${SANS};color:${C.text};">
        <strong>${esc(p.studio.name)} ${esc(p.studio.outlet)}</strong>${p.studio.address ? `<br>${esc(p.studio.address)}` : ''}${contact ? `<br>${esc(contact)}` : ''}
        <br><span style="color:${C.soft};">You are receiving this email because of your booking with ${esc(p.studio.name)}. Reply to this email to reach the studio.</span>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

/** Plain-text version (shown by mail apps that block HTML, and helps avoid spam filters). */
export function renderText(p: EmailParts) {
  const lines = [p.heading, '', p.body.trim(), ''];
  for (const [k, v] of p.details) if (v) lines.push(`${k}: ${v.replace(/\n/g, ', ')}`);
  if (p.note) lines.push('', p.note.trim());
  for (const b of p.buttons) lines.push('', `${b.label}: ${b.url}`);
  lines.push('', '—', `${p.studio.name} ${p.studio.outlet}`);
  if (p.studio.address) lines.push(p.studio.address);
  if (p.studio.whatsapp) lines.push(`WhatsApp +${p.studio.whatsapp}`);
  return lines.join('\n');
}
