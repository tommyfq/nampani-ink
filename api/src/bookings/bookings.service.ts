import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { BookingKind, BookingSource, BookingStatus, Prisma } from '@prisma/client';
import { SessionUser } from '../common/auth.decorators';
import { PrismaService } from '../db/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { localParts, normalizePhone, REOPEN_ROLES, TRANSITIONS } from './booking.rules';

export interface CustomerInput {
  id?: string;
  name?: string;
  phone?: string;
  email?: string;
}

export interface CreateBookingInput {
  outletId: string;
  artistId: string;
  kind: BookingKind;
  source: BookingSource;
  startsAt: string;
  endsAt: string;
  customer: CustomerInput;
  styleId?: string | null;
  placement?: string;
  size?: string;
  idea?: string;
  notes?: string;
  quotedPrice?: number | null;
  parentId?: string | null;
  allowOutsideShift?: boolean;
}

export interface UpdateBookingInput {
  artistId?: string;
  startsAt?: string;
  endsAt?: string;
  styleId?: string | null;
  placement?: string;
  size?: string;
  idea?: string;
  notes?: string;
  quotedPrice?: number | null;
  allowOutsideShift?: boolean;
}

const MAX_MINUTES = 12 * 60;

export const bookingInclude = {
  customer: { select: { id: true, name: true, phone: true, email: true } },
  artist: { select: { id: true, displayName: true } },
  style: { select: { id: true, name: true } },
} satisfies Prisma.BookingInclude;

@Injectable()
export class BookingsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BookingsService.name);
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  // ---------------------------------------------------------------- access

  /** Non-owners can only work with outlets they are assigned to. */
  assertOutlet(user: SessionUser, outletId: string) {
    if (user.role !== 'OWNER' && !user.outletIds.includes(outletId)) {
      throw new ForbiddenException('You do not have access to this outlet');
    }
  }

  // ---------------------------------------------------------------- customers

  /** Finds the customer by id or phone, creating or updating them as needed. */
  async resolveCustomer(input: CustomerInput, tx: Prisma.TransactionClient) {
    if (input.id) {
      const c = await tx.customer.findUnique({ where: { id: input.id } });
      if (!c) throw new BadRequestException('Customer not found');
      return c;
    }
    const phone = input.phone ? normalizePhone(input.phone) : null;
    if (!phone) throw new BadRequestException({ message: 'Invalid data', issues: [{ path: 'customer.phone', message: 'Enter a valid WhatsApp number, e.g. 0812… or +61 4…' }] });
    const name = input.name?.trim();
    const existing = await tx.customer.findUnique({ where: { phone } });
    if (existing) {
      if (input.email && !existing.email) return tx.customer.update({ where: { id: existing.id }, data: { email: input.email } });
      return existing;
    }
    if (!name) throw new BadRequestException({ message: 'Invalid data', issues: [{ path: 'customer.name', message: 'Enter the customer name' }] });
    return tx.customer.create({ data: { name, phone, email: input.email ?? '' } });
  }

  // ---------------------------------------------------------------- numbering

  /** Next booking code for an outlet: NPI-CGU-26-00042 (gap-free per outlet and year). */
  private async nextCode(tx: Prisma.TransactionClient, outletId: string, outletCode: string) {
    const year = new Date().getUTCFullYear();
    const rows = await tx.$queryRaw<{ lastValue: number }[]>`
      INSERT INTO "NumberSequence" ("outletId", "kind", "year", "lastValue")
      VALUES (${outletId}::uuid, 'booking', ${year}, 1)
      ON CONFLICT ("outletId", "kind", "year") DO UPDATE SET "lastValue" = "NumberSequence"."lastValue" + 1
      RETURNING "lastValue"`;
    return `NPI-${outletCode}-${String(year).slice(2)}-${String(rows[0].lastValue).padStart(5, '0')}`;
  }

  // ---------------------------------------------------------------- checks

  private parseRange(startsAt: string, endsAt: string) {
    const start = new Date(startsAt);
    const end = new Date(endsAt);
    if (Number.isNaN(+start) || Number.isNaN(+end)) throw new BadRequestException('Invalid date or time');
    if (end <= start) throw new BadRequestException({ message: 'Invalid data', issues: [{ path: 'endsAt', message: 'End must be after start' }] });
    if ((+end - +start) / 60000 > MAX_MINUTES) throw new BadRequestException({ message: 'Invalid data', issues: [{ path: 'endsAt', message: 'A booking can be at most 12 hours' }] });
    return { start, end };
  }

  /**
   * The artist must work at this outlet for the whole time (weekly shift) and have no
   * leave or blocked time then. Owners and managers may book outside the shift.
   */
  private async checkAvailability(
    tx: Prisma.TransactionClient,
    opts: { artistId: string; outletId: string; start: Date; end: Date; allowOutsideShift: boolean; user: SessionUser },
  ) {
    const artist = await tx.artist.findUnique({ where: { id: opts.artistId }, include: { shifts: true } });
    if (!artist || !artist.isActive) throw new BadRequestException('Artist not found');
    const outlet = await tx.outlet.findUniqueOrThrow({ where: { id: opts.outletId } });

    const off = await tx.artistTimeOff.findFirst({ where: { artistId: artist.id, startsAt: { lt: opts.end }, endsAt: { gt: opts.start } } });
    if (off) throw new ConflictException(`${artist.displayName} is on leave or blocked at this time`);

    const canOverride = opts.allowOutsideShift && (opts.user.role === 'OWNER' || opts.user.role === 'MANAGER');
    if (canOverride) return artist;

    const s = localParts(opts.start, outlet.timezone);
    const e = localParts(opts.end, outlet.timezone);
    const endHHMM = e.date !== s.date && e.hhmm === '00:00' ? '24:00' : e.hhmm;
    const sameDay = e.date === s.date || endHHMM === '24:00';
    const fits = sameDay && artist.shifts.some((sh) => sh.outletId === outlet.id && sh.weekday === s.weekday && sh.startTime <= s.hhmm && endHHMM <= sh.endTime);
    if (!fits) throw new ConflictException(`${artist.displayName} is not on shift at ${outlet.name} for this whole time`);
    return artist;
  }

  /** Turns the database's double-booking rule into a readable message. */
  private overlapError(err: unknown, artistName = 'This artist'): never {
    const msg = err instanceof Error ? err.message : '';
    if (msg.includes('Booking_no_double_booking') || (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2004')) {
      throw new ConflictException(`${artistName} already has a booking at this time`);
    }
    throw err;
  }

  // ---------------------------------------------------------------- create / update

  async create(input: CreateBookingInput, user: SessionUser) {
    this.assertOutlet(user, input.outletId);
    const { start, end } = this.parseRange(input.startsAt, input.endsAt);
    const outlet = await this.prisma.outlet.findUnique({ where: { id: input.outletId } });
    if (!outlet) throw new BadRequestException('Outlet not found');

    let artistName = 'This artist';
    try {
      return await this.prisma.$transaction(async (tx) => {
        const artist = await this.checkAvailability(tx, { artistId: input.artistId, outletId: outlet.id, start, end, allowOutsideShift: Boolean(input.allowOutsideShift), user });
        artistName = artist.displayName;
        const customer = await this.resolveCustomer(input.customer, tx);
        if (input.parentId && !(await tx.booking.findUnique({ where: { id: input.parentId } }))) throw new BadRequestException('Consultation not found');
        const status: BookingStatus = input.source === 'WALK_IN' ? 'CHECKED_IN' : 'BOOKED';
        const booking = await tx.booking.create({
          data: {
            code: await this.nextCode(tx, outlet.id, outlet.code),
            outletId: outlet.id,
            customerId: customer.id,
            artistId: artist.id,
            styleId: input.styleId ?? null,
            kind: input.kind,
            source: input.source,
            status,
            startsAt: start,
            endsAt: end,
            placement: input.placement ?? '',
            size: input.size ?? '',
            idea: input.idea ?? '',
            notes: input.notes ?? '',
            quotedPrice: input.quotedPrice != null ? BigInt(input.quotedPrice) : null,
            parentId: input.parentId ?? null,
            createdById: user.id,
            events: { create: { type: 'created', toStatus: status, userId: user.id, note: input.source === 'WALK_IN' ? 'Walk-in' : '' } },
          },
          include: bookingInclude,
        });
        return booking;
      });
    } catch (err) {
      this.overlapError(err, artistName);
    }
  }

  async update(id: string, input: UpdateBookingInput, user: SessionUser) {
    const current = await this.prisma.booking.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Booking not found');
    this.assertOutlet(user, current.outletId);
    if (['COMPLETED', 'CANCELLED', 'NO_SHOW'].includes(current.status)) throw new BadRequestException('This booking is closed and cannot be changed');

    const moving = input.startsAt !== undefined || input.endsAt !== undefined || input.artistId !== undefined;
    let artistName = 'This artist';
    try {
      return await this.prisma.$transaction(async (tx) => {
        let range: { start: Date; end: Date } | undefined;
        const artistId = input.artistId ?? current.artistId;
        if (moving) {
          range = this.parseRange(input.startsAt ?? current.startsAt!.toISOString(), input.endsAt ?? current.endsAt!.toISOString());
          if (!artistId) throw new BadRequestException('Choose an artist');
          const artist = await this.checkAvailability(tx, { artistId, outletId: current.outletId, start: range.start, end: range.end, allowOutsideShift: Boolean(input.allowOutsideShift), user });
          artistName = artist.displayName;
        }
        const { allowOutsideShift: _o, quotedPrice, startsAt: _s, endsAt: _e, ...rest } = input;
        const booking = await tx.booking.update({
          where: { id },
          data: {
            ...rest,
            ...(range ? { startsAt: range.start, endsAt: range.end, artistId } : {}),
            ...(quotedPrice !== undefined ? { quotedPrice: quotedPrice != null ? BigInt(quotedPrice) : null } : {}),
            ...(current.status === 'REQUESTED' && range ? { status: 'BOOKED' as BookingStatus } : {}),
          },
          include: bookingInclude,
        });
        await tx.bookingEvent.create({
          data: {
            bookingId: id,
            type: moving ? 'rescheduled' : 'updated',
            userId: user.id,
            note: moving && current.startsAt ? `Moved from ${current.startsAt.toISOString()}` : '',
            ...(current.status === 'REQUESTED' && range ? { fromStatus: 'REQUESTED' as BookingStatus, toStatus: 'BOOKED' as BookingStatus } : {}),
          },
        });
        return booking;
      });
    } catch (err) {
      this.overlapError(err, artistName);
    }
  }

  async setStatus(id: string, to: BookingStatus, note: string, user: SessionUser) {
    const current = await this.prisma.booking.findUnique({ where: { id }, include: { artist: { select: { displayName: true } } } });
    if (!current) throw new NotFoundException('Booking not found');
    this.assertOutlet(user, current.outletId);
    if (!TRANSITIONS[current.status].includes(to)) {
      throw new BadRequestException(`A ${current.status.toLowerCase().replace('_', ' ')} booking cannot become ${to.toLowerCase().replace('_', ' ')}`);
    }
    if (current.kind === 'TATTOO' && to === 'CONFIRMED') throw new BadRequestException('Record the DP to confirm a tattoo booking');
    if (current.kind === 'TATTOO' && to === 'COMPLETED') throw new BadRequestException('Record the final payment to complete a tattoo booking');
    if (to === 'BOOKED' && (current.status === 'CANCELLED' || current.status === 'NO_SHOW') && !REOPEN_ROLES.includes(user.role)) {
      throw new ForbiddenException('Only a manager or owner can reopen a booking');
    }
    if ((to === 'CANCELLED' || to === 'NO_SHOW') && !note.trim()) {
      throw new BadRequestException({ message: 'Invalid data', issues: [{ path: 'note', message: 'Add a short reason' }] });
    }
    try {
      return await this.prisma.$transaction(async (tx) => {
        const booking = await tx.booking.update({ where: { id }, data: { status: to }, include: bookingInclude });
        await tx.bookingEvent.create({ data: { bookingId: id, type: 'status', fromStatus: current.status, toStatus: to, note, userId: user.id } });
        return booking;
      });
    } catch (err) {
      this.overlapError(err, current.artist?.displayName);
    }
  }

  // ---------------------------------------------------------------- auto no-show

  onModuleInit() {
    if (process.env.DISABLE_JOBS === 'true') return;
    this.timer = setInterval(() => this.autoNoShow().catch((e) => this.logger.error(e.message)), 10 * 60 * 1000);
    setTimeout(() => this.autoNoShow().catch((e) => this.logger.error(e.message)), 15_000);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** Booked / confirmed appointments the customer never came to are marked no-show after the setting's hours. */
  async autoNoShow() {
    const hours = await this.settings.get<number>('booking.autoCancelHours');
    const cutoff = new Date(Date.now() - hours * 3600_000);
    const stale = await this.prisma.booking.findMany({ where: { status: { in: ['BOOKED', 'CONFIRMED'] }, endsAt: { lt: cutoff } }, select: { id: true, status: true } });
    for (const b of stale) {
      await this.prisma.$transaction([
        this.prisma.booking.update({ where: { id: b.id }, data: { status: 'NO_SHOW' } }),
        this.prisma.bookingEvent.create({ data: { bookingId: b.id, type: 'status', fromStatus: b.status, toStatus: 'NO_SHOW', note: `Automatically cancelled: customer did not come within ${hours} hours` } }),
      ]);
    }
    if (stale.length) this.logger.log(`Marked ${stale.length} booking(s) as no-show`);
    return stale.length;
  }
}
