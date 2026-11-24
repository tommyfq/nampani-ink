import { BadRequestException, Body, ConflictException, Controller, Get, Module, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards, UseInterceptors } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { SessionGuard } from '../auth/session.guard';
import { AuditInterceptor } from '../common/audit.interceptor';
import { CurrentUser, Roles, SessionUser } from '../common/auth.decorators';
import { ZodPipe } from '../common/zod.pipe';
import { PrismaService } from '../db/prisma.service';
import { normalizePhone } from './booking.rules';
import { bookingInclude, BookingsService } from './bookings.service';

const iso = z.string().datetime({ offset: true });
const text = (max: number) => z.string().max(max);
const price = z.number().int().min(0).max(1_000_000_000).nullable().optional();

const CustomerRef = z.union([
  z.object({ id: z.string().uuid() }),
  z.object({ name: text(80).optional(), phone: text(30).min(1, 'Enter the WhatsApp number'), email: z.string().email().max(200).or(z.literal('')).optional() }),
]);

const CreateSchema = z.object({
  outletId: z.string().uuid(),
  artistId: z.string().uuid(),
  kind: z.enum(['CONSULTATION', 'TATTOO']),
  source: z.enum(['POS', 'WALK_IN']).default('POS'),
  startsAt: iso,
  endsAt: iso,
  customer: CustomerRef,
  styleId: z.string().uuid().nullable().optional(),
  placement: text(80).optional(),
  size: text(40).optional(),
  idea: text(2000).optional(),
  notes: text(2000).optional(),
  quotedPrice: price,
  parentId: z.string().uuid().nullable().optional(),
  allowOutsideShift: z.boolean().optional(),
});

const UpdateSchema = z.object({
  kind: z.enum(['CONSULTATION', 'TATTOO']).optional(),
  artistId: z.string().uuid().optional(),
  startsAt: iso.optional(),
  endsAt: iso.optional(),
  styleId: z.string().uuid().nullable().optional(),
  placement: text(80).optional(),
  size: text(40).optional(),
  idea: text(2000).optional(),
  notes: text(2000).optional(),
  quotedPrice: price,
  allowOutsideShift: z.boolean().optional(),
});

const StatusSchema = z.object({
  status: z.enum(['BOOKED', 'CONFIRMED', 'CHECKED_IN', 'COMPLETED', 'CANCELLED', 'NO_SHOW']),
  note: text(300).default(''),
});

const CustomerSchema = z.object({
  name: text(80).min(1),
  phone: text(30),
  email: z.string().email().max(200).or(z.literal('')).default(''),
  country: text(60).default(''),
  instagram: text(60).default(''),
  notes: text(2000).default(''),
  marketingOptIn: z.boolean().default(false),
});

type BookingRow = Prisma.BookingGetPayload<{ include: typeof bookingInclude }>;

/** Artists see who they are tattooing, but not phone numbers, emails, prices or internal notes. */
export function forRole(b: BookingRow, user: SessionUser) {
  if (user.role !== 'ARTIST') return b;
  return { ...b, customer: { id: b.customer.id, name: b.customer.name, phone: '', email: '' }, notes: '', quotedPrice: null };
}

@Controller('pos/bookings')
@UseGuards(SessionGuard)
@UseInterceptors(AuditInterceptor)
@Roles('MANAGER', 'FRONT_DESK')
export class BookingsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bookings: BookingsService,
  ) {}

  @Get(':id')
  @Roles('MANAGER', 'FRONT_DESK', 'ARTIST')
  async one(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: SessionUser) {
    const b = await this.prisma.booking.findUnique({
      where: { id },
      include: {
        ...bookingInclude,
        events: { orderBy: { at: 'asc' }, include: { user: { select: { name: true } } } },
        parent: { select: { id: true, code: true, kind: true } },
        followUps: { select: { id: true, code: true, kind: true, status: true, startsAt: true } },
        payments: { orderBy: { paidAt: 'asc' }, include: { receivedBy: { select: { name: true } } } },
      },
    });
    if (!b) throw new NotFoundException('Booking not found');
    if (user.role === 'ARTIST') {
      const mine = await this.prisma.artist.findUnique({ where: { userId: user.id } });
      if (!mine || mine.id !== b.artistId) throw new NotFoundException('Booking not found');
    } else this.bookings.assertOutlet(user, b.outletId);
    return user.role === 'ARTIST' ? { ...forRole(b, user), payments: [] } : b;
  }

  @Post()
  create(@Body(new ZodPipe(CreateSchema)) body: z.infer<typeof CreateSchema>, @CurrentUser() user: SessionUser) {
    return this.bookings.create(body, user);
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(UpdateSchema)) body: z.infer<typeof UpdateSchema>, @CurrentUser() user: SessionUser) {
    return this.bookings.update(id, body, user);
  }

  @Post(':id/status')
  status(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(StatusSchema)) body: z.infer<typeof StatusSchema>, @CurrentUser() user: SessionUser) {
    return this.bookings.setStatus(id, body.status, body.note, user);
  }
}

@Controller('pos/customers')
@UseGuards(SessionGuard)
@UseInterceptors(AuditInterceptor)
@Roles('MANAGER', 'FRONT_DESK')
export class CustomersController {
  constructor(private readonly prisma: PrismaService) {}

  /** Search by name or phone (any format: 0812…, +62 812…, 812…). */
  @Get()
  search(@Query('q') q = '') {
    const term = q.trim();
    if (term.length < 2) return [];
    const digits = term.replace(/\D/g, '');
    const phone = digits.length >= 4 ? normalizePhone(term) ?? digits : null;
    return this.prisma.customer.findMany({
      where: {
        OR: [
          { name: { contains: term, mode: 'insensitive' } },
          ...(digits.length >= 4 ? [{ phone: { contains: digits } }] : []),
          ...(phone ? [{ phone: { contains: phone.slice(-9) } }] : []),
        ],
      },
      take: 10,
      orderBy: { updatedAt: 'desc' },
      include: { _count: { select: { bookings: true } } },
    });
  }

  @Get(':id')
  async one(@Param('id', ParseUUIDPipe) id: string) {
    const c = await this.prisma.customer.findUnique({
      where: { id },
      include: {
        bookings: {
          orderBy: { startsAt: 'desc' },
          take: 50,
          include: { artist: { select: { displayName: true } }, outlet: { select: { name: true } } },
        },
      },
    });
    if (!c) throw new NotFoundException('Customer not found');
    return c;
  }

  @Patch(':id')
  async update(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(CustomerSchema.partial())) body: Partial<z.infer<typeof CustomerSchema>>) {
    if (!(await this.prisma.customer.findUnique({ where: { id } }))) throw new NotFoundException('Customer not found');
    const data = { ...body };
    if (body.phone !== undefined) {
      const phone = normalizePhone(body.phone);
      if (!phone) throw new BadRequestException({ message: 'Invalid data', issues: [{ path: 'phone', message: 'Enter a valid WhatsApp number' }] });
      data.phone = phone;
    }
    return this.prisma.customer.update({ where: { id }, data }).catch((err) => {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('Another customer already has this number');
      }
      throw err;
    });
  }
}

@Module({
  controllers: [BookingsController, CustomersController],
  providers: [BookingsService],
  exports: [BookingsService],
})
export class BookingsModule {}
