import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Injectable, Module, Param, Post, Query, UseGuards, UseInterceptors } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { SessionGuard } from '../auth/session.guard';
import { reminderDueAt, rupiah } from '../bookings/booking.rules';
import { AuditInterceptor } from '../common/audit.interceptor';
import { CurrentUser, Roles, SessionUser } from '../common/auth.decorators';
import { ZodPipe } from '../common/zod.pipe';
import { PrismaService } from '../db/prisma.service';
import { SettingsService } from '../settings/settings.service';
import type { SettingKey } from '../admin/schemas';

export const MESSAGE_TYPES = ['consultationReminder', 'dpConfirmation', 'appointmentReminder', 'receipt'] as const;
export type MessageType = (typeof MESSAGE_TYPES)[number];
export const MESSAGE_LABEL: Record<MessageType, string> = {
  consultationReminder: 'Consultation reminder',
  dpConfirmation: 'DP receipt + booking confirmed',
  appointmentReminder: 'Appointment reminder',
  receipt: 'Final receipt',
};

type State = 'todo' | 'upcoming' | 'sent';
export interface MessageItem {
  key: string;
  type: MessageType;
  label: string;
  state: State;
  dueAt: string;
  bookingId: string;
  bookingCode: string;
  paymentId: string | null;
  customer: { name: string; phone: string };
  artist: string;
  startsAt: string | null;
  text: string;
  waUrl: string;
  receiptPath: string | null;
  sentAt: string | null;
  sentBy: string | null;
}

const bookingInc = {
  customer: { select: { name: true, phone: true } },
  artist: { select: { displayName: true } },
  outlet: true,
  messages: { include: { sentBy: { select: { name: true } } } },
} satisfies Prisma.BookingInclude;
type BookingRow = Prisma.BookingGetPayload<{ include: typeof bookingInc }>;

@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  private fill(template: string, v: Record<string, string>) {
    return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in v ? v[k] : m));
  }

  private vars(b: BookingRow, studio: string, extra: Record<string, string> = {}) {
    const tz = b.outlet.timezone;
    const s = b.startsAt;
    return {
      nama: b.customer.name,
      studio,
      outlet: b.outlet.name,
      hari: s ? s.toLocaleDateString('id-ID', { weekday: 'long', timeZone: tz }) : '-',
      tanggal: s ? s.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', timeZone: tz }) : '-',
      jam: s ? s.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: tz }).replace('.', ':') : '-',
      artist: b.artist?.displayName ?? '-',
      kode: b.code,
      alamat: [b.outlet.street, b.outlet.locality].filter(Boolean).join(', '),
      maps: b.outlet.mapsUrl,
      ...extra,
    };
  }

  private item(type: MessageType, b: BookingRow, text: string, dueAt: Date, paymentId: string | null, now: Date): MessageItem {
    const key = paymentId ? `${type}:${b.id}:${paymentId}` : `${type}:${b.id}`;
    const log = b.messages.find((m) => m.key === key);
    return {
      key,
      type,
      label: MESSAGE_LABEL[type],
      state: log ? 'sent' : dueAt <= now ? 'todo' : 'upcoming',
      dueAt: dueAt.toISOString(),
      bookingId: b.id,
      bookingCode: b.code,
      paymentId,
      customer: { name: b.customer.name, phone: b.customer.phone },
      artist: b.artist?.displayName ?? '-',
      startsAt: b.startsAt?.toISOString() ?? null,
      text,
      waUrl: `https://wa.me/${b.customer.phone}?text=${encodeURIComponent(text)}`,
      receiptPath: paymentId ? `/api/pos/payments/${paymentId}/receipt` : null,
      sentAt: log?.sentAt.toISOString() ?? null,
      sentBy: log?.sentBy?.name ?? null,
    };
  }

  /** All WhatsApp messages for an outlet (or one booking), with their state. */
  async list(user: SessionUser, opts: { outletId?: string; bookingId?: string }): Promise<MessageItem[]> {
    const now = new Date();
    const enabled = Object.fromEntries(await Promise.all(MESSAGE_TYPES.map(async (t) => [t, Boolean(await this.settings.get(`whatsapp.${t}` as SettingKey))])));
    const templates = Object.fromEntries(await Promise.all(MESSAGE_TYPES.map(async (t) => [t, await this.settings.get<string>(`template.${t}` as SettingKey)])));
    const hours = await this.settings.get<number>('reminder.hoursBefore');
    const winStart = await this.settings.get<string>('reminder.windowStart');
    const winEnd = await this.settings.get<string>('reminder.windowEnd');
    const studio = ((await this.prisma.siteSetting.findUnique({ where: { key: 'studio' } }))?.value as { name?: string } | null)?.name ?? 'Nampani Ink';

    const scope: Prisma.BookingWhereInput = opts.bookingId ? { id: opts.bookingId } : { outletId: opts.outletId };
    const outletFilter = user.role === 'OWNER' ? {} : { outletId: { in: user.outletIds } };
    const items: MessageItem[] = [];

    // Reminders: active bookings starting within the next 7 days (or the one booking asked for).
    const upcoming = await this.prisma.booking.findMany({
      where: {
        ...scope,
        ...outletFilter,
        status: { in: ['BOOKED', 'CONFIRMED'] },
        startsAt: opts.bookingId ? { not: null } : { gt: now, lt: new Date(+now + 7 * 864e5) },
      },
      include: bookingInc,
      orderBy: { startsAt: 'asc' },
    });
    for (const b of upcoming) {
      const type: MessageType = b.kind === 'CONSULTATION' ? 'consultationReminder' : 'appointmentReminder';
      if (!enabled[type] || !b.startsAt) continue;
      const due = reminderDueAt(b.startsAt, b.outlet.timezone, hours, winStart, winEnd);
      items.push(this.item(type, b, this.fill(templates[type], this.vars(b, studio)), due, null, now));
    }

    // Payment messages: DP confirmation and final receipt, last 14 days.
    const payments = await this.prisma.payment.findMany({
      where: {
        voidedAt: null,
        ...(opts.bookingId ? { bookingId: opts.bookingId } : { outletId: opts.outletId, paidAt: { gt: new Date(+now - 14 * 864e5) } }),
        ...(user.role === 'OWNER' ? {} : { outletId: { in: user.outletIds } }),
      },
      include: { booking: { include: bookingInc } },
      orderBy: { paidAt: 'desc' },
    });
    for (const p of payments) {
      const type: MessageType = p.kind === 'DP' ? 'dpConfirmation' : 'receipt';
      if (!enabled[type]) continue;
      const total = p.subtotal - p.discount;
      const v = this.vars(p.booking, studio, { jumlah: rupiah(p.amount), total: rupiah(total), sisa: rupiah(p.kind === 'DP' ? p.subtotal - p.amount : 0n), kuitansi: p.receiptNo });
      items.push(this.item(type, p.booking, this.fill(templates[type], v), p.paidAt, p.id, now));
    }

    const order: Record<State, number> = { todo: 0, upcoming: 1, sent: 2 };
    return items.sort((a, b) => order[a.state] - order[b.state] || +new Date(a.dueAt) - +new Date(b.dueAt));
  }
}

const SentSchema = z.object({
  type: z.enum(MESSAGE_TYPES),
  bookingId: z.string().uuid(),
  paymentId: z.string().uuid().nullable().optional(),
});

@Controller('pos/messages')
@UseGuards(SessionGuard)
@UseInterceptors(AuditInterceptor)
@Roles('MANAGER', 'FRONT_DESK')
export class MessagesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly messages: MessagesService,
  ) {}

  @Get()
  list(@Query('outletId') outletId: string | undefined, @Query('bookingId') bookingId: string | undefined, @CurrentUser() user: SessionUser) {
    const uuid = z.string().uuid();
    if (bookingId ? !uuid.safeParse(bookingId).success : !uuid.safeParse(outletId).success) throw new BadRequestException('outletId or bookingId is required');
    if (outletId && user.role !== 'OWNER' && !user.outletIds.includes(outletId)) throw new ForbiddenException('You do not have access to this outlet');
    return this.messages.list(user, { outletId, bookingId });
  }

  /** Staff confirm they sent the message in WhatsApp. */
  @Post('sent')
  async sent(@Body(new ZodPipe(SentSchema)) body: z.infer<typeof SentSchema>, @CurrentUser() user: SessionUser) {
    const b = await this.prisma.booking.findUnique({ where: { id: body.bookingId }, select: { outletId: true } });
    if (!b) throw new BadRequestException('Booking not found');
    if (user.role !== 'OWNER' && !user.outletIds.includes(b.outletId)) throw new ForbiddenException();
    const key = body.paymentId ? `${body.type}:${body.bookingId}:${body.paymentId}` : `${body.type}:${body.bookingId}`;
    return this.prisma.messageLog.upsert({
      where: { key },
      update: {},
      create: { key, type: body.type, bookingId: body.bookingId, paymentId: body.paymentId ?? null, sentById: user.id },
    });
  }

  /** Undo "sent". */
  @Delete('sent/:key')
  async unsent(@Param('key') key: string, @CurrentUser() user: SessionUser) {
    const log = await this.prisma.messageLog.findUnique({ where: { key }, include: { booking: { select: { outletId: true } } } });
    if (!log) return { ok: true };
    if (user.role !== 'OWNER' && !user.outletIds.includes(log.booking.outletId)) throw new ForbiddenException();
    await this.prisma.messageLog.delete({ where: { key } });
    return { ok: true };
  }
}

@Module({ controllers: [MessagesController], providers: [MessagesService] })
export class MessagesModule {}
