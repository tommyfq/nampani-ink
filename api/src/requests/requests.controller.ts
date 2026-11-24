import { BadRequestException, Body, Controller, Delete, Get, HttpCode, MessageEvent, Module, Post, Query, Req, Sse, UseGuards, UseInterceptors } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { filter, interval, map, merge, Observable } from 'rxjs';
import { z } from 'zod';
import { SessionGuard } from '../auth/session.guard';
import { normalizePhone } from '../bookings/booking.rules';
import { BookingsModule } from '../bookings/bookings.controller';
import { bookingInclude, BookingsService } from '../bookings/bookings.service';
import { AuditInterceptor } from '../common/audit.interceptor';
import { CurrentUser, Roles, SessionUser } from '../common/auth.decorators';
import { ZodPipe } from '../common/zod.pipe';
import { PrismaService } from '../db/prisma.service';
import { isPushEndpoint, NotifyService } from '../notify/notify.service';

const text = (max: number) => z.string().trim().max(max);

/** What the website booking form sends. Ids are the public slugs the website uses. */
const RequestSchema = z.object({
  studio: z.string().min(1).max(60),
  artist: z.string().max(60).optional().default(''),
  style: z.string().max(60).optional().default(''),
  name: text(80).min(1, 'Enter your name'),
  phone: text(30).min(1, 'Enter your WhatsApp number'),
  email: z.string().trim().toLowerCase().email('Enter a valid email').max(200).or(z.literal('')).optional().default(''),
  preferredDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal('')).optional().default(''),
  placement: text(80).optional().default(''),
  size: text(40).optional().default(''),
  idea: text(2000).optional().default(''),
  design: text(40).optional().default(''),
  photos: z.array(z.string().regex(/^\/uploads\/references\/[0-9a-f-]{36}\.(jpg|png|webp|gif|heic)$/)).max(3).optional().default([]),
  newsOptIn: z.boolean().optional().default(false),
  // Honeypot: hidden on the form, so only bots fill it in.
  website: z.string().max(200).optional().default(''),
});

/** Booking requests sent from the public website. */
@Controller('requests')
export class PublicRequestsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bookings: BookingsService,
    private readonly notify: NotifyService,
  ) {}

  @Post()
  @HttpCode(201)
  @Throttle({ default: { limit: 5, ttl: 10 * 60_000 } })
  async create(@Body(new ZodPipe(RequestSchema)) body: z.infer<typeof RequestSchema>) {
    if (body.website) return { code: null }; // bot: pretend it worked, save nothing

    const phone = normalizePhone(body.phone);
    if (!phone) throw new BadRequestException({ message: 'Invalid data', issues: [{ path: 'phone', message: 'Enter a valid WhatsApp number with country code, e.g. +62 812… or +61 4…' }] });
    const outlet = await this.prisma.outlet.findFirst({ where: { slug: body.studio, isActive: true } });
    if (!outlet) throw new BadRequestException({ message: 'Invalid data', issues: [{ path: 'studio', message: 'Choose a studio' }] });
    const artist = body.artist ? await this.prisma.artist.findFirst({ where: { slug: body.artist, isActive: true, isPublic: true } }) : null;
    const style = body.style ? await this.prisma.style.findFirst({ where: { slug: body.style } }) : null;

    const booking = await this.prisma.$transaction(async (tx) => {
      // Known customers keep their saved name; the form can add an email and opt in to news (never opt out).
      const existing = await tx.customer.findUnique({ where: { phone } });
      const customer = existing
        ? await tx.customer.update({
            where: { id: existing.id },
            data: { ...(body.email && !existing.email ? { email: body.email } : {}), ...(body.newsOptIn ? { marketingOptIn: true } : {}) },
          })
        : await tx.customer.create({ data: { name: body.name, phone, email: body.email, marketingOptIn: body.newsOptIn } });

      const nameNote = existing && existing.name.trim().toLowerCase() !== body.name.trim().toLowerCase() ? `Name on the form: ${body.name}` : '';
      return tx.booking.create({
        data: {
          code: await this.bookings.nextCode(tx, outlet.id, outlet.code),
          outletId: outlet.id,
          customerId: customer.id,
          artistId: artist?.id ?? null,
          styleId: style?.id ?? null,
          kind: 'CONSULTATION',
          source: 'WEBSITE',
          status: 'REQUESTED',
          placement: body.placement,
          size: body.size,
          idea: body.idea,
          preferredDate: body.preferredDate,
          design: body.design,
          photos: body.photos,
          notes: nameNote,
          events: { create: { type: 'created', toStatus: 'REQUESTED', note: 'Request from the website' } },
        },
        include: bookingInclude,
      });
    });

    const summary = [style?.name, body.placement].filter(Boolean).join(', ');
    await this.notify.newRequest({ id: booking.id, outletId: outlet.id, code: booking.code, customerName: booking.customer.name, summary });
    return { code: booking.code };
  }
}

const SubscribeSchema = z.object({
  endpoint: z.string().url().max(1000),
  keys: z.object({ p256dh: z.string().min(20).max(200), auth: z.string().min(8).max(100) }),
});

/** POS inbox of website requests, the live event stream and this device's notification setting. */
@Controller('pos')
@UseGuards(SessionGuard)
@Roles('MANAGER', 'FRONT_DESK')
export class InboxController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bookings: BookingsService,
    private readonly notify: NotifyService,
  ) {}

  /** Requests waiting for staff, newest first, plus the artists to schedule them with. */
  @Get('inbox')
  async inbox(@Query('outletId') outletId: string, @CurrentUser() user: SessionUser) {
    if (!outletId) throw new BadRequestException('Choose an outlet');
    this.bookings.assertOutlet(user, outletId);
    const [requests, artists] = await Promise.all([
      this.prisma.booking.findMany({
        where: { outletId, status: 'REQUESTED' },
        orderBy: { createdAt: 'desc' },
        take: 200,
        include: { ...bookingInclude, customer: { select: { id: true, name: true, phone: true, email: true, marketingOptIn: true, _count: { select: { bookings: true } } } } },
      }),
      this.prisma.artist.findMany({ where: { isActive: true }, orderBy: [{ sort: 'asc' }, { displayName: 'asc' }], select: { id: true, displayName: true, homeOutletId: true } }),
    ]);
    return { requests, artists };
  }

  /** Number of open requests per outlet the user can see (for the menu badge). */
  @Get('inbox/count')
  async count(@CurrentUser() user: SessionUser) {
    const where = user.role === 'OWNER' ? { status: 'REQUESTED' as const } : { status: 'REQUESTED' as const, outletId: { in: user.outletIds } };
    return { count: await this.prisma.booking.count({ where }) };
  }

  /** Live events for open POS screens (Server-Sent Events). A ping every 25 s keeps proxies from closing it. */
  @Sse('events')
  events(@CurrentUser() user: SessionUser): Observable<MessageEvent> {
    const mine = this.notify.live.pipe(
      filter((e) => user.role === 'OWNER' || user.outletIds.includes(e.outletId)),
      map((e) => ({ type: e.type, data: { outletId: e.outletId, bookingId: e.bookingId } })),
    );
    return merge(mine, interval(25_000).pipe(map(() => ({ type: 'ping', data: '' }))));
  }

  @Get('push/key')
  key() {
    return { publicKey: this.notify.pushAvailable ? this.notify.publicKey : null };
  }

  @Post('push/subscribe')
  @HttpCode(204)
  @UseInterceptors(AuditInterceptor)
  async subscribe(@Body(new ZodPipe(SubscribeSchema)) body: z.infer<typeof SubscribeSchema>, @CurrentUser() user: SessionUser, @Req() req: Request) {
    if (!isPushEndpoint(body.endpoint)) throw new BadRequestException('This browser push service is not supported');
    const data = { userId: user.id, p256dh: body.keys.p256dh, auth: body.keys.auth, userAgent: String(req.headers['user-agent'] ?? '').slice(0, 300), lastUsedAt: new Date() };
    await this.prisma.pushSubscription.upsert({ where: { endpoint: body.endpoint }, update: data, create: { endpoint: body.endpoint, ...data } });
  }

  @Delete('push/subscribe')
  @HttpCode(204)
  async unsubscribe(@Query('endpoint') endpoint: string, @CurrentUser() user: SessionUser) {
    if (endpoint) await this.prisma.pushSubscription.deleteMany({ where: { endpoint, userId: user.id } });
  }
}

@Module({
  imports: [BookingsModule],
  controllers: [PublicRequestsController, InboxController],
})
export class RequestsModule {}
