import { Controller, Get, Module, UseGuards } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { SessionGuard } from '../auth/session.guard';
import { ACTIVE_STATUSES, localParts, zonedInstant } from '../bookings/booking.rules';
import { CurrentUser, Roles, SessionUser } from '../common/auth.decorators';
import { PrismaService } from '../db/prisma.service';

const TZ = 'Asia/Makassar';
const DAY = 864e5;

/** Numbers for the Overview page. Owners see every outlet; others see their own outlets. */
@Controller('pos/dashboard')
@UseGuards(SessionGuard)
@Roles('MANAGER', 'FRONT_DESK')
export class DashboardController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async summary(@CurrentUser() user: SessionUser) {
    const outlet: Prisma.BookingWhereInput = user.role === 'OWNER' ? {} : { outletId: { in: user.outletIds } };
    const payOutlet: Prisma.PaymentWhereInput = user.role === 'OWNER' ? {} : { outletId: { in: user.outletIds } };
    const today = localParts(new Date(), TZ).date;
    const dayStart = zonedInstant(today, '00:00', TZ);
    const dayEnd = new Date(+dayStart + DAY);
    const weekEnd = new Date(+dayStart + 7 * DAY);
    const seeMoney = user.role === 'OWNER' || user.role === 'MANAGER';

    const [todayBookings, requests, nextWeek, paidToday, recentPayments] = await Promise.all([
      this.prisma.booking.findMany({
        where: { ...outlet, status: { in: ACTIVE_STATUSES }, startsAt: { gte: dayStart, lt: dayEnd } },
        orderBy: { startsAt: 'asc' },
        take: 50,
        select: {
          id: true,
          code: true,
          kind: true,
          status: true,
          startsAt: true,
          customer: { select: { name: true } },
          artist: { select: { displayName: true } },
          outlet: { select: { name: true } },
        },
      }),
      this.prisma.booking.findMany({
        where: { ...outlet, status: 'REQUESTED' },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { id: true, code: true, createdAt: true, preferredDate: true, customer: { select: { name: true } } },
      }),
      this.prisma.booking.count({ where: { ...outlet, status: { in: ACTIVE_STATUSES }, startsAt: { gte: dayStart, lt: weekEnd } } }),
      seeMoney
        ? this.prisma.payment.aggregate({ where: { ...payOutlet, voidedAt: null, paidAt: { gte: dayStart, lt: dayEnd } }, _sum: { amount: true }, _count: true })
        : null,
      seeMoney
        ? this.prisma.payment.findMany({
            where: { ...payOutlet, voidedAt: null, paidAt: { gte: new Date(+dayStart - 6 * DAY), lt: dayEnd } },
            select: { amount: true, paidAt: true },
          })
        : [],
    ]);
    const openRequests = await this.prisma.booking.count({ where: { ...outlet, status: 'REQUESTED' } });

    // Money taken on each of the last 7 days (oldest first).
    const week = Array.from({ length: 7 }, (_, i) => {
      const date = localParts(new Date(+dayStart - (6 - i) * DAY + 12 * 3600_000), TZ).date;
      return { date, amount: 0 };
    });
    for (const p of recentPayments) {
      const d = week.find((w) => w.date === localParts(p.paidAt, TZ).date);
      if (d) d.amount += Number(p.amount);
    }

    return {
      today,
      bookingsToday: todayBookings.length,
      doneToday: todayBookings.filter((b) => b.status === 'COMPLETED').length,
      inStudio: todayBookings.filter((b) => b.status === 'CHECKED_IN').length,
      nextWeek,
      openRequests,
      money: seeMoney ? { today: Number(paidToday?._sum.amount ?? 0), paymentsToday: paidToday?._count ?? 0, week } : null,
      appointments: todayBookings,
      requests,
    };
  }
}

@Module({ controllers: [DashboardController] })
export class DashboardModule {}
