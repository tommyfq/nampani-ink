import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Module,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { z } from 'zod';
import { SessionGuard } from '../auth/session.guard';
import { AuditInterceptor } from '../common/audit.interceptor';
import { CurrentUser, Roles, SessionUser } from '../common/auth.decorators';
import { ZodPipe } from '../common/zod.pipe';
import { PrismaService } from '../db/prisma.service';
import { forRole } from '../bookings/bookings.controller';
import { bookingInclude } from '../bookings/bookings.service';

const TimeOffSchema = z
  .object({
    type: z.enum(['LEAVE', 'GUEST_SPOT', 'BLOCKED']).default('LEAVE'),
    startsAt: z.string().datetime({ offset: true }),
    endsAt: z.string().datetime({ offset: true }),
    note: z.string().max(200).default(''),
  })
  .refine((t) => new Date(t.startsAt) < new Date(t.endsAt), { message: 'End must be after start', path: ['endsAt'] });

const MAX_DAYS = 31;

/** Outlets a user may see on the schedule: owners all; others their assigned outlets plus where their artist profile works. */
async function visibleOutletIds(prisma: PrismaService, user: SessionUser): Promise<string[] | 'all'> {
  if (user.role === 'OWNER') return 'all';
  const ids = new Set(user.outletIds);
  const artist = await prisma.artist.findUnique({ where: { userId: user.id }, include: { shifts: { select: { outletId: true } } } });
  if (artist?.homeOutletId) ids.add(artist.homeOutletId);
  artist?.shifts.forEach((s) => ids.add(s.outletId));
  return [...ids];
}

@Controller('pos/schedule')
@UseGuards(SessionGuard)
export class ScheduleController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Everything the schedule grid needs for one outlet and date range:
   * outlet hours, the artists who work there, their weekly shifts (all outlets) and time off.
   */
  @Get()
  async get(@Query('outletId') outletId: string, @Query('from') from: string, @Query('to') to: string, @CurrentUser() user: SessionUser) {
    if (!z.string().uuid().safeParse(outletId).success) throw new BadRequestException('outletId is required');
    const start = new Date(from);
    const end = new Date(to);
    if (Number.isNaN(+start) || Number.isNaN(+end) || end <= start || +end - +start > MAX_DAYS * 864e5) {
      throw new BadRequestException(`from/to must be a valid range of at most ${MAX_DAYS} days`);
    }
    const visible = await visibleOutletIds(this.prisma, user);
    if (visible !== 'all' && !visible.includes(outletId)) throw new ForbiddenException('You do not have access to this outlet');

    const outlet = await this.prisma.outlet.findUnique({ where: { id: outletId } });
    if (!outlet) throw new NotFoundException('Outlet not found');

    const artists = await this.prisma.artist.findMany({
      where: { isActive: true, OR: [{ homeOutletId: outletId }, { shifts: { some: { outletId } } }] },
      select: {
        id: true,
        displayName: true,
        role: true,
        homeOutletId: true,
        userId: true,
        shifts: { select: { id: true, outletId: true, weekday: true, startTime: true, endTime: true } },
        timeOff: {
          where: { startsAt: { lt: end }, endsAt: { gt: start } },
          select: { id: true, type: true, startsAt: true, endsAt: true, note: true },
          orderBy: { startsAt: 'asc' },
        },
      },
      orderBy: [{ sort: 'asc' }, { displayName: 'asc' }],
    });
    const outlets = await this.prisma.outlet.findMany({ select: { id: true, name: true, code: true }, where: { isActive: true } });
    const styles = await this.prisma.style.findMany({ select: { id: true, name: true }, orderBy: [{ sort: 'asc' }, { name: 'asc' }] });

    const bookings = await this.prisma.booking.findMany({
      where: {
        artistId: { in: artists.map((a) => a.id) },
        startsAt: { lt: end },
        endsAt: { gt: start },
        status: { notIn: ['CANCELLED', 'NO_SHOW', 'REQUESTED'] },
      },
      include: bookingInclude,
      orderBy: { startsAt: 'asc' },
    });

    return {
      outlet: { id: outlet.id, name: outlet.name, timezone: outlet.timezone, opens: outlet.opens, closes: outlet.closes },
      outlets,
      styles,
      artists,
      bookings: bookings.map((b) => forRole(b, user)),
      canEdit: user.role === 'OWNER' || user.role === 'MANAGER',
      canBook: user.role !== 'ARTIST',
    };
  }
}

/** Time off (leave, guest spot, blocked hours) — owner and manager. */
@Controller('admin')
@UseGuards(SessionGuard)
@UseInterceptors(AuditInterceptor)
@Roles('MANAGER')
export class TimeOffController {
  constructor(private readonly prisma: PrismaService) {}

  @Post('artists/:id/time-off')
  async create(@Param('id', ParseUUIDPipe) artistId: string, @Body(new ZodPipe(TimeOffSchema)) body: z.infer<typeof TimeOffSchema>) {
    if (!(await this.prisma.artist.findUnique({ where: { id: artistId } }))) throw new NotFoundException('Artist not found');
    return this.prisma.artistTimeOff.create({
      data: { artistId, type: body.type, startsAt: new Date(body.startsAt), endsAt: new Date(body.endsAt), note: body.note },
    });
  }

  @Delete('time-off/:id')
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    if (!(await this.prisma.artistTimeOff.findUnique({ where: { id } }))) throw new NotFoundException();
    await this.prisma.artistTimeOff.delete({ where: { id } });
    return { id };
  }
}

@Module({ controllers: [ScheduleController, TimeOffController] })
export class ScheduleModule {}
