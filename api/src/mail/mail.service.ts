import { Global, Injectable, Logger, Module, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import nodemailer, { Transporter } from 'nodemailer';
import { join, resolve } from 'path';
import type { SettingKey } from '../admin/schemas';
import { localParts, reminderDueAt, rupiah, zonedInstant } from '../bookings/booking.rules';
import { PrismaService } from '../db/prisma.service';
import { buildReceipt } from '../payments/receipt.data';
import { SettingsService } from '../settings/settings.service';
import { DEFAULT_TEMPLATES, EmailParts, EmailTemplate, EmailType, fill, renderHtml, renderText } from './mail.templates';

/*
 * Configuration (environment):
 *   SMTP_HOST, SMTP_PORT (465), SMTP_SECURE (true for 465), SMTP_USER, SMTP_PASS
 *   MAIL_FROM        "Nampani Ink <news@nampani.ink>"
 *   MAIL_REPLY_TO    optional, defaults to MAIL_FROM
 *   MAIL_STUDIO_TO   where new-request alerts go, defaults to the MAIL_FROM address
 *   POS_URL          link in studio alerts, e.g. https://pos.nampani.ink
 * Without SMTP_HOST: in development emails are saved to MAIL_OUTBOX_DIR (./mail-outbox)
 * so they can be opened in a browser or Mail; in production they are skipped and logged.
 */

const bookingInc = {
  customer: true,
  outlet: true,
  artist: { select: { displayName: true } },
  style: { select: { name: true } },
} satisfies Prisma.BookingInclude;
type BookingRow = Prisma.BookingGetPayload<{ include: typeof bookingInc }>;

const TZ_LABEL: Record<string, string> = { 'Asia/Makassar': 'WITA', 'Asia/Jakarta': 'WIB', 'Asia/Pontianak': 'WIB', 'Asia/Jayapura': 'WIT' };
const MAX_ATTEMPTS = 3;

interface Outgoing {
  type: EmailType | 'test';
  key: string;
  to: string;
  subject: string;
  parts: EmailParts;
  bookingId?: string | null;
  paymentId?: string | null;
  attachments?: { filename: string; content: Buffer; contentType: string }[];
}

@Injectable()
export class MailService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MailService.name);
  private transport?: Transporter;
  private timer?: NodeJS.Timeout;
  readonly from = process.env.MAIL_FROM || 'Nampani Ink <news@nampani.ink>';
  private readonly outboxDir = resolve(process.env.MAIL_OUTBOX_DIR || 'mail-outbox');
  readonly mode: 'smtp' | 'outbox' | 'off' = process.env.SMTP_HOST ? 'smtp' : process.env.NODE_ENV === 'production' ? 'off' : 'outbox';

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  onModuleInit() {
    if (this.mode === 'smtp') {
      const port = Number(process.env.SMTP_PORT || 465);
      this.transport = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port,
        secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : port === 465,
        auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
      });
    } else if (this.mode === 'outbox') {
      this.transport = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: 'unix' });
      this.logger.log(`SMTP is not set: emails are saved to ${this.outboxDir}`);
    } else {
      this.logger.warn('SMTP is not set: emails are not sent');
    }
    if (process.env.DISABLE_JOBS === 'true') return;
    this.timer = setInterval(() => this.runJobs(), 5 * 60_000);
    setTimeout(() => this.runJobs(), 20_000);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private get fromAddress() {
    return this.from.match(/<([^>]+)>/)?.[1] ?? this.from;
  }

  status() {
    return { mode: this.mode, from: this.from, studioTo: process.env.MAIL_STUDIO_TO || this.fromAddress };
  }

  /** Runs a send in the background: a failed email never breaks a booking or payment. */
  later(work: () => Promise<unknown>) {
    work().catch((err) => this.logger.error(`Email error: ${(err as Error).message}`));
  }

  // ---------------------------------------------------------------- switches and templates

  private async allowed(type: EmailType) {
    if (!(await this.settings.get<boolean>('email.enabled'))) return false;
    return Boolean(await this.settings.get(`email.${type}` as SettingKey));
  }

  async template(type: EmailType): Promise<EmailTemplate> {
    const t = await this.settings.get<EmailTemplate>(`emailTemplate.${type}` as SettingKey);
    return t?.subject && t?.body ? t : DEFAULT_TEMPLATES[type];
  }

  // ---------------------------------------------------------------- building blocks

  private async studio(b: Pick<BookingRow, 'outlet'>) {
    const row = await this.prisma.siteSetting.findUnique({ where: { key: 'studio' } });
    const s = (row?.value ?? {}) as { name?: string; email?: string };
    const o = b.outlet;
    return {
      name: s.name || 'Nampani Ink',
      outlet: o.name,
      address: [o.street, o.locality, o.region].filter(Boolean).join(', '),
      whatsapp: o.whatsapp,
      email: s.email || this.fromAddress,
    };
  }

  private when(at: Date | null, tz: string) {
    if (!at) return { day: '', date: '', time: '' };
    return {
      day: at.toLocaleDateString('en-GB', { weekday: 'long', timeZone: tz }),
      date: at.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: tz }),
      time: `${localParts(at, tz).hhmm} ${TZ_LABEL[tz] ?? ''}`.trim(),
    };
  }

  private vars(b: BookingRow, studio: { name: string; outlet: string; address: string }, extra: Record<string, string> = {}) {
    const w = this.when(b.startsAt, b.outlet.timezone);
    return {
      name: b.customer.name,
      firstName: b.customer.name.trim().split(/\s+/)[0] ?? b.customer.name,
      studio: studio.name,
      outlet: studio.outlet,
      kind: b.kind === 'TATTOO' ? 'tattoo session' : 'consultation',
      ...w,
      artist: b.artist?.displayName ?? 'our team',
      code: b.code,
      address: studio.address,
      amount: '',
      total: '',
      remaining: '',
      receiptNo: '',
      ...extra,
    };
  }

  private appointmentRows(b: BookingRow, v: Record<string, string>, address: string): [string, string][] {
    return [
      ['Booking', `${b.kind === 'TATTOO' ? 'Tattoo session' : 'Consultation'} · ${b.code}`],
      ['Date', `${v.day}, ${v.date}`],
      ['Time', v.time],
      ['Artist', b.artist?.displayName ?? ''],
      ['Studio', `${v.studio} ${v.outlet}${address ? `\n${address}` : ''}`],
    ];
  }

  private contactButtons(b: BookingRow) {
    const buttons: { label: string; url: string }[] = [];
    if (b.outlet.mapsUrl) buttons.push({ label: 'Open in Google Maps', url: b.outlet.mapsUrl });
    if (b.outlet.whatsapp) buttons.push({ label: 'WhatsApp us', url: `https://wa.me/${b.outlet.whatsapp}` });
    return buttons;
  }

  private async load(bookingId: string) {
    return this.prisma.booking.findUnique({ where: { id: bookingId }, include: bookingInc });
  }

  // ---------------------------------------------------------------- delivery

  /** Sends once per key. Returns the log row (or null when skipped before logging). */
  private async deliver(m: Outgoing) {
    const existing = await this.prisma.emailLog.findUnique({ where: { key: m.key } });
    if (existing?.status === 'SENT') return existing;
    if (existing && existing.attempts >= MAX_ATTEMPTS && existing.status !== 'SKIPPED') return existing;
    const attempts = (existing?.attempts ?? 0) + 1;
    const base = { type: m.type, to: m.to, subject: m.subject, bookingId: m.bookingId ?? null, paymentId: m.paymentId ?? null, attempts };

    if (this.mode === 'off' || !this.transport) {
      return this.prisma.emailLog.upsert({
        where: { key: m.key },
        create: { key: m.key, ...base, status: 'SKIPPED', error: 'Email server (SMTP) is not set up yet' },
        update: { ...base, status: 'SKIPPED', error: 'Email server (SMTP) is not set up yet' },
      });
    }
    try {
      const info = await this.transport.sendMail({
        from: this.from,
        replyTo: process.env.MAIL_REPLY_TO || this.from,
        to: m.to,
        subject: m.subject,
        html: renderHtml(m.parts),
        text: renderText(m.parts),
        attachments: m.attachments,
      });
      if (this.mode === 'outbox') await this.saveToOutbox(m, info.message as Buffer);
      return this.prisma.emailLog.upsert({
        where: { key: m.key },
        create: { key: m.key, ...base, status: 'SENT', sentAt: new Date() },
        update: { ...base, status: 'SENT', error: '', sentAt: new Date() },
      });
    } catch (err) {
      const error = (err as Error).message.slice(0, 500);
      this.logger.warn(`Email ${m.type} to ${m.to} failed: ${error}`);
      return this.prisma.emailLog.upsert({
        where: { key: m.key },
        create: { key: m.key, ...base, status: 'FAILED', error },
        update: { ...base, status: 'FAILED', error },
      });
    }
  }

  /** Development only: keeps a copy you can open (.html in a browser, .eml in Mail with attachments). */
  private async saveToOutbox(m: Outgoing, raw: Buffer) {
    await mkdir(this.outboxDir, { recursive: true });
    const name = `${new Date().toISOString().replace(/[:.]/g, '-')}-${m.type}`;
    await writeFile(join(this.outboxDir, `${name}.eml`), raw);
    await writeFile(join(this.outboxDir, `${name}.html`), renderHtml(m.parts));
    this.logger.log(`Email "${m.subject}" to ${m.to} saved to mail-outbox/${name}.html`);
  }

  // ---------------------------------------------------------------- the emails

  /** Customer: "we received your request" + studio: "new request" alert. */
  async newRequest(bookingId: string) {
    const b = await this.load(bookingId);
    if (!b) return;
    const studio = await this.studio(b);
    const v = this.vars(b, studio, { date: b.preferredDate ? new Date(`${b.preferredDate}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' }) : '' });
    const request: [string, string][] = [
      ['Request code', b.code],
      ['Studio', `${studio.name} ${studio.outlet}`],
      ['Artist', b.artist?.displayName ?? 'Any available'],
      ['Style', b.style?.name ?? 'Not sure yet'],
      ['Preferred date', v.date],
      ['Placement', b.placement],
      ['Size', b.size],
    ];

    if (b.customer.email && (await this.allowed('requestReceived'))) {
      const t = await this.template('requestReceived');
      await this.deliver({
        type: 'requestReceived',
        key: `requestReceived:${b.id}`,
        to: b.customer.email,
        subject: fill(t.subject, v),
        bookingId: b.id,
        parts: { preheader: `Request ${b.code}: we will reply on WhatsApp soon.`, heading: 'Thank you for your request', body: fill(t.body, v), details: request, buttons: b.outlet.whatsapp ? [{ label: 'WhatsApp us', url: `https://wa.me/${b.outlet.whatsapp}` }] : [], studio },
      });
    }

    if (await this.allowed('studioAlert')) {
      const t = await this.template('studioAlert');
      const pos = (process.env.POS_URL || 'https://pos.nampani.ink').replace(/\/$/, '');
      await this.deliver({
        type: 'studioAlert',
        key: `studioAlert:${b.id}`,
        to: process.env.MAIL_STUDIO_TO || this.fromAddress,
        subject: fill(t.subject, v),
        bookingId: b.id,
        parts: {
          preheader: `${b.customer.name} · ${[b.style?.name, b.placement].filter(Boolean).join(', ')}`,
          heading: 'New booking request',
          body: fill(t.body, v),
          details: [['Customer', b.customer.name], ['WhatsApp', `+${b.customer.phone}`], ['Email', b.customer.email], ...request.slice(0, 1), ...request.slice(2), ['Idea', b.idea], ['Photos', b.photos.length ? `${b.photos.length} reference photo(s) in the inbox` : ''], ['News', b.customer.marketingOptIn ? 'Wants news and offers' : '']],
          buttons: [{ label: 'Open the inbox', url: `${pos}/admin/inbox?id=${b.id}` }],
          studio,
        },
      });
    }
  }

  /** Customer: booking confirmed (first time) or moved (new time). Walk-ins and past times get nothing. */
  async bookingScheduled(bookingId: string) {
    const b = await this.load(bookingId);
    if (!b?.startsAt || !b.customer.email || b.source === 'WALK_IN') return;
    if (!['BOOKED', 'CONFIRMED'].includes(b.status) || b.startsAt <= new Date()) return;
    if (!(await this.allowed('bookingConfirmed'))) return;
    const studio = await this.studio(b);
    const v = this.vars(b, studio);
    const t = await this.template('bookingConfirmed');
    const moved = (await this.prisma.emailLog.count({ where: { bookingId: b.id, type: 'bookingConfirmed', status: 'SENT' } })) > 0;
    await this.deliver({
      type: 'bookingConfirmed',
      key: `bookingConfirmed:${b.id}:${b.startsAt.toISOString()}`,
      to: b.customer.email,
      subject: `${moved ? 'New time: ' : ''}${fill(t.subject, v)}`,
      bookingId: b.id,
      parts: {
        preheader: `${v.day}, ${v.date} at ${v.time}`,
        heading: moved ? 'Your booking has a new time' : b.kind === 'TATTOO' ? 'Your tattoo session is booked' : 'Your consultation is booked',
        body: fill(t.body, v),
        details: this.appointmentRows(b, v, studio.address),
        buttons: this.contactButtons(b),
        studio,
      },
    });
  }

  /** Customer: DP or final receipt with the PDF attached. */
  async paymentReceipt(paymentId: string) {
    const r = await buildReceipt(this.prisma, paymentId);
    if (!r || r.p.voidedAt) return;
    const type: EmailType = r.p.kind === 'DP' ? 'dpReceipt' : 'finalReceipt';
    const b = await this.load(r.p.bookingId);
    if (!b?.customer.email || !(await this.allowed(type))) return;
    const studio = await this.studio(b);
    const remaining = r.p.kind === 'DP' ? r.p.subtotal - r.p.amount : 0n;
    const v = this.vars(b, studio, { amount: rupiah(r.p.amount), total: rupiah(r.p.subtotal - r.p.discount), remaining: rupiah(remaining), receiptNo: r.p.receiptNo });
    const t = await this.template(type);
    const paidOn = r.p.paidAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: b.outlet.timezone });
    const details: [string, string][] =
      type === 'dpReceipt'
        ? [['Receipt', r.p.receiptNo], ['Deposit paid', `${v.amount} · ${r.p.methodName}`], ['After your session', v.remaining], ...this.appointmentRows(b, v, studio.address).slice(1)]
        : [['Receipt', r.p.receiptNo], ['Paid', `${v.amount} · ${r.p.methodName}`], ['Tattoo price', v.total], ['Date', paidOn], ['Artist', b.artist?.displayName ?? '']];
    await this.deliver({
      type,
      key: `${type}:${b.id}:${r.p.id}`,
      to: b.customer.email,
      subject: fill(t.subject, v),
      bookingId: b.id,
      paymentId: r.p.id,
      attachments: [{ filename: r.fileName, content: r.pdf, contentType: 'application/pdf' }],
      parts: {
        preheader: `Receipt ${r.p.receiptNo} · ${v.amount}`,
        heading: type === 'dpReceipt' ? 'Deposit received' : 'Thank you for your visit',
        body: fill(t.body, v),
        details,
        buttons: type === 'dpReceipt' ? this.contactButtons(b) : b.outlet.whatsapp ? [{ label: 'WhatsApp us', url: `https://wa.me/${b.outlet.whatsapp}` }] : [],
        studio,
      },
    });
  }

  /** Customer: reminder before a consultation or tattoo, inside the 08:00–20:00 window. */
  async sendDueReminders() {
    if (!(await this.allowed('reminder'))) return 0;
    const [hours, winStart, winEnd] = await Promise.all([
      this.settings.get<number>('reminder.hoursBefore'),
      this.settings.get<string>('reminder.windowStart'),
      this.settings.get<string>('reminder.windowEnd'),
    ]);
    const now = new Date();
    const upcoming = await this.prisma.booking.findMany({
      where: { status: { in: ['BOOKED', 'CONFIRMED'] }, startsAt: { gt: now, lt: new Date(+now + (hours + 24) * 3600_000) }, customer: { email: { not: '' } } },
      include: bookingInc,
    });
    let sent = 0;
    for (const b of upcoming) {
      const tz = b.outlet.timezone;
      const due = reminderDueAt(b.startsAt!, tz, hours, winStart, winEnd);
      const local = localParts(now, tz).hhmm;
      if (now < due || local < winStart || local > winEnd) continue;
      const key = `reminder:${b.id}:${b.startsAt!.toISOString()}`;
      const done = await this.prisma.emailLog.findUnique({ where: { key } });
      if (done && done.status !== 'RETRY') continue;
      // Booked after the reminder time (e.g. same day): the confirmation was enough.
      const confirmation = await this.prisma.emailLog.findUnique({ where: { key: `bookingConfirmed:${b.id}:${b.startsAt!.toISOString()}` } });
      if (confirmation && confirmation.createdAt > due) continue;

      const studio = await this.studio(b);
      const v = this.vars(b, studio);
      const t = await this.template('reminder');
      await this.deliver({
        type: 'reminder',
        key,
        to: b.customer.email,
        subject: fill(t.subject, v),
        bookingId: b.id,
        parts: {
          preheader: `${v.day} at ${v.time} with ${v.artist}`,
          heading: b.kind === 'TATTOO' ? 'See you soon for your tattoo' : 'See you soon',
          body: fill(t.body, v),
          details: this.appointmentRows(b, v, studio.address),
          note: b.kind === 'TATTOO' ? 'Before your session: eat a proper meal, sleep well, drink water and avoid alcohol for 24 hours. Wear clothes that make the tattoo area easy to reach.' : undefined,
          buttons: this.contactButtons(b),
          studio,
        },
      });
      sent++;
    }
    return sent;
  }

  /** Tries failed emails again (up to 3 attempts, for one day). */
  async retryFailed() {
    const failed = await this.prisma.emailLog.findMany({ where: { status: 'FAILED', attempts: { lt: MAX_ATTEMPTS }, createdAt: { gt: new Date(Date.now() - 864e5) } }, take: 20 });
    for (const f of failed) {
      if (!f.bookingId) continue;
      // Rebuild and resend through the normal path, allowing a retry of the failed key.
      await this.prisma.emailLog.update({ where: { id: f.id }, data: { status: 'RETRY' } });
      if (f.type === 'requestReceived' || f.type === 'studioAlert') await this.newRequest(f.bookingId);
      else if (f.type === 'bookingConfirmed') await this.bookingScheduled(f.bookingId);
      else if ((f.type === 'dpReceipt' || f.type === 'finalReceipt') && f.paymentId) await this.paymentReceipt(f.paymentId);
      else if (f.type === 'reminder') await this.sendDueReminders();
      // Anything not resent (switched off, cancelled booking…) stays failed.
      await this.prisma.emailLog.updateMany({ where: { id: f.id, status: 'RETRY' }, data: { status: 'FAILED' } });
    }
  }

  private async runJobs() {
    try {
      await this.sendDueReminders();
      await this.retryFailed();
    } catch (err) {
      this.logger.error(`Email job failed: ${(err as Error).message}`);
    }
  }

  // ---------------------------------------------------------------- admin: preview and test

  /** Sample email with made-up details, using the given (unsaved) template. */
  async sample(type: EmailType, template?: EmailTemplate) {
    const t = template ?? (await this.template(type));
    const outlet = await this.prisma.outlet.findFirst({ where: { isActive: true }, orderBy: { sort: 'asc' } });
    const fake = {
      id: '00000000-0000-0000-0000-000000000000',
      code: `NPI-${outlet?.code ?? 'CGU'}-26-00042`,
      kind: type === 'dpReceipt' || type === 'finalReceipt' ? 'TATTOO' : 'CONSULTATION',
      startsAt: zonedInstant(localParts(new Date(Date.now() + 2 * 864e5), outlet?.timezone ?? 'Asia/Makassar').date, '14:00', outlet?.timezone ?? 'Asia/Makassar'),
      preferredDate: '',
      placement: 'Inner forearm',
      size: '8 cm',
      idea: 'A small lotus with a fine line stem',
      photos: [],
      source: 'WEBSITE',
      customer: { name: 'Jess Taylor', phone: '61412345678', email: 'jess@example.com', marketingOptIn: true },
      outlet: outlet ?? { name: 'Canggu', code: 'CGU', street: 'Jl. Example 1', locality: 'Canggu', region: 'Bali', timezone: 'Asia/Makassar', whatsapp: '6281200000001', mapsUrl: 'https://maps.google.com' },
      artist: { displayName: 'Ayu' },
      style: { name: 'Fine Line' },
    } as unknown as BookingRow;
    const studio = await this.studio(fake);
    const v = this.vars(fake, studio, { amount: rupiah(150000), total: rupiah(1500000), remaining: rupiah(1350000), receiptNo: `NPI-${outlet?.code ?? 'CGU'}-R-26-00042` });
    const parts: EmailParts = {
      preheader: 'Preview',
      heading: { requestReceived: 'Thank you for your request', studioAlert: 'New booking request', bookingConfirmed: 'Your consultation is booked', dpReceipt: 'Deposit received', reminder: 'See you soon', finalReceipt: 'Thank you for your visit' }[type],
      body: fill(t.body, v),
      details: type === 'requestReceived' || type === 'studioAlert' ? [['Request code', fake.code], ['Style', 'Fine Line'], ['Placement', fake.placement], ['Size', fake.size]] : type === 'dpReceipt' || type === 'finalReceipt' ? [['Receipt', v.receiptNo], ['Paid', `${v.amount} · Cash`], ...this.appointmentRows(fake, v, studio.address).slice(1, 4)] : this.appointmentRows(fake, v, studio.address),
      buttons: type === 'studioAlert' ? [{ label: 'Open the inbox', url: 'https://pos.nampani.ink/admin/inbox' }] : this.contactButtons(fake),
      studio,
    };
    return { subject: fill(t.subject, v), parts, html: renderHtml(parts) };
  }

  /** Staff login code. The code is never stored in the email log (only in the message itself). */
  async loginCode(to: string, name: string, code: string, info: { device: string; ip: string }) {
    const row = await this.prisma.siteSetting.findUnique({ where: { key: 'studio' } });
    const s = (row?.value ?? {}) as { name?: string; email?: string };
    const studioName = s.name || 'Nampani Ink';
    const at = new Date();
    const when = `${at.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Makassar' })}, ${localParts(at, 'Asia/Makassar').hhmm} WITA`;
    return this.deliver({
      type: 'loginCode' as EmailType,
      key: `login:${randomUUID()}`,
      to,
      subject: `Your ${studioName} login code`,
      parts: {
        preheader: `Your login code is ${code}. It works for 10 minutes.`,
        heading: code,
        body: `Hi ${name.split(' ')[0]},\n\nUse this code to finish logging in to the ${studioName} POS. It works for 10 minutes and only once.\n\nNever share this code. Our team will never ask you for it.`,
        details: [
          ['Time', when],
          ['Device', info.device],
          ['IP address', info.ip || 'Unknown'],
        ],
        buttons: [],
        note: "Wasn't you? Someone knows your password. Don't enter the code, and ask the owner to change your password right away.",
        studio: { name: studioName, outlet: '', address: '', whatsapp: '', email: s.email || this.fromAddress },
        footer: `You are receiving this email because someone logged in to your ${studioName} staff account.`,
      },
    });
  }

  async sendTest(type: EmailType, to: string, template?: EmailTemplate) {
    const s = await this.sample(type, template);
    return this.deliver({ type: 'test', key: `test:${randomUUID()}`, to, subject: `[Test] ${s.subject}`, parts: s.parts });
  }
}

@Global()
@Module({ providers: [MailService], exports: [MailService] })
export class MailModule {}
