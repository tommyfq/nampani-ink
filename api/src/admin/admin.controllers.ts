import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { AuthService } from '../auth/auth.service';
import { hashSecret } from '../auth/password';
import { SessionGuard } from '../auth/session.guard';
import { AuditInterceptor } from '../common/audit.interceptor';
import { CurrentUser, Roles, SessionUser } from '../common/auth.decorators';
import { ZodPipe } from '../common/zod.pipe';
import { PrismaService } from '../db/prisma.service';
import {
  ArtistSchema,
  OutletSchema,
  RevenueSchemeSchema,
  SETTINGS,
  SettingKey,
  ShiftsSchema,
  UserCreateSchema,
  UserUpdateSchema,
} from './schemas';

/** Turns unique-constraint errors into a readable 409. */
function conflict(err: unknown): never {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
    throw new ConflictException(`Already in use: ${(err.meta?.target as string[] | undefined)?.join(', ') ?? 'value'}`);
  }
  throw err;
}

// ---------------------------------------------------------------------------
// Outlets (owner)
// ---------------------------------------------------------------------------

@Controller('admin/outlets')
@UseGuards(SessionGuard)
@UseInterceptors(AuditInterceptor)
@Roles('OWNER')
export class OutletsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @Roles('MANAGER', 'FRONT_DESK', 'ARTIST')
  list(@CurrentUser() user: SessionUser) {
    return this.prisma.outlet.findMany({
      where: user.role === 'OWNER' ? {} : { id: { in: user.outletIds } },
      orderBy: [{ sort: 'asc' }, { name: 'asc' }],
    });
  }

  @Post()
  create(@Body(new ZodPipe(OutletSchema)) body: z.infer<typeof OutletSchema>) {
    return this.prisma.outlet.create({ data: body }).catch(conflict);
  }

  @Patch(':id')
  async update(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(OutletSchema.partial())) body: Partial<z.infer<typeof OutletSchema>>) {
    await this.prisma.outlet.findUniqueOrThrow({ where: { id } }).catch(() => {
      throw new NotFoundException();
    });
    return this.prisma.outlet.update({ where: { id }, data: body }).catch(conflict);
  }
}

// ---------------------------------------------------------------------------
// Staff logins (owner)
// ---------------------------------------------------------------------------

const userSelect = {
  id: true,
  name: true,
  email: true,
  phone: true,
  role: true,
  isActive: true,
  lastLoginAt: true,
  createdAt: true,
  pinHash: true,
  outlets: { select: { outletId: true } },
  artist: { select: { id: true, displayName: true } },
} satisfies Prisma.UserSelect;

/** Never send the PIN hash to the browser, only whether a PIN is set. */
const publicUser = <T extends { pinHash: string | null }>({ pinHash, ...u }: T) => ({ ...u, hasPin: Boolean(pinHash) });

@Controller('admin/users')
@UseGuards(SessionGuard)
@UseInterceptors(AuditInterceptor)
@Roles('OWNER')
export class UsersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
  ) {}

  @Get()
  async list() {
    const users = await this.prisma.user.findMany({ select: userSelect, orderBy: [{ isActive: 'desc' }, { name: 'asc' }] });
    return users.map(publicUser);
  }

  @Post()
  async create(@Body(new ZodPipe(UserCreateSchema)) body: z.infer<typeof UserCreateSchema>) {
    const { password, outletIds, ...data } = body;
    return this.prisma.user
      .create({
        data: {
          ...data,
          passwordHash: await hashSecret(password),
          outlets: { create: outletIds.map((outletId) => ({ outletId })) },
        },
        select: userSelect,
      })
      .then(publicUser)
      .catch(conflict);
  }

  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(UserUpdateSchema)) body: z.infer<typeof UserUpdateSchema>,
    @CurrentUser() me: SessionUser,
  ) {
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException();
    if (id === me.id && (body.isActive === false || (body.role && body.role !== 'OWNER'))) {
      throw new BadRequestException('You cannot deactivate or demote your own account');
    }
    const { password, pin, outletIds, ...data } = body;
    const updated = await this.prisma.user
      .update({
      where: { id },
      data: {
        ...data,
        ...(password ? { passwordHash: await hashSecret(password) } : {}),
        ...(pin !== undefined ? { pinHash: pin ? await hashSecret(pin) : null } : {}),
        ...(outletIds ? { outlets: { deleteMany: {}, create: outletIds.map((outletId) => ({ outletId })) } } : {}),
      },
      select: userSelect,
      })
      .catch(conflict);
    // A new password, a new login email or deactivation logs the person out everywhere.
    if (password || body.isActive === false || (data.email && data.email !== existing.email)) await this.auth.revokeAll(id);
    return publicUser(updated);
  }

  /**
   * Deletes a login that was never used for real work (e.g. made by mistake).
   * Anyone with history (bookings, payments, messages, audit log, revenue share) is kept,
   * so old records still show who did what: deactivate them instead.
   */
  @Delete(':id')
  async remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() me: SessionUser) {
    if (id === me.id) throw new BadRequestException('You cannot delete your own account');
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        role: true,
        isActive: true,
        _count: {
          select: {
            auditLogs: true,
            bookingsMade: true,
            bookingEvents: true,
            paymentsTaken: true,
            paymentsVoided: true,
            messagesSent: true,
            revenuePayee: true,
          },
        },
      },
    });
    if (!user) throw new NotFoundException();
    if (Object.values(user._count).some((n) => n > 0)) {
      throw new ConflictException('This person already has bookings, payments or other history, so the login cannot be deleted. Turn off "Active" instead: they can no longer log in and old records keep their name.');
    }
    await this.prisma.user.delete({ where: { id } });
    await this.auth.revokeAll(id);
    return { id };
  }
}

// ---------------------------------------------------------------------------
// Artists and shifts (owner, manager)
// ---------------------------------------------------------------------------

const artistInclude = {
  specialties: { select: { styleId: true } },
  shifts: { orderBy: [{ weekday: 'asc' }, { startTime: 'asc' }] },
  user: { select: { id: true, name: true, email: true } },
} satisfies Prisma.ArtistInclude;

@Controller('admin/artists')
@UseGuards(SessionGuard)
@UseInterceptors(AuditInterceptor)
@Roles('MANAGER')
export class ArtistsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @Roles('MANAGER', 'FRONT_DESK')
  list() {
    return this.prisma.artist.findMany({ include: artistInclude, orderBy: [{ sort: 'asc' }, { displayName: 'asc' }] });
  }

  @Post()
  create(@Body(new ZodPipe(ArtistSchema)) body: z.infer<typeof ArtistSchema>) {
    const { specialtyIds = [], ...data } = body;
    return this.prisma.artist
      .create({ data: { ...data, specialties: { create: specialtyIds.map((styleId) => ({ styleId })) } }, include: artistInclude })
      .catch(conflict);
  }

  @Patch(':id')
  async update(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(ArtistSchema.partial())) body: Partial<z.infer<typeof ArtistSchema>>) {
    if (!(await this.prisma.artist.findUnique({ where: { id } }))) throw new NotFoundException();
    const { specialtyIds, ...data } = body;
    return this.prisma.artist
      .update({
        where: { id },
        data: {
          ...data,
          ...(specialtyIds ? { specialties: { deleteMany: {}, create: specialtyIds.map((styleId) => ({ styleId })) } } : {}),
        },
        include: artistInclude,
      })
      .catch(conflict);
  }

  /** Replaces the artist's weekly shifts. */
  @Put(':id/shifts')
  async shifts(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(ShiftsSchema)) body: z.infer<typeof ShiftsSchema>) {
    if (!(await this.prisma.artist.findUnique({ where: { id } }))) throw new NotFoundException();
    await this.prisma.$transaction([
      this.prisma.artistShift.deleteMany({ where: { artistId: id } }),
      this.prisma.artistShift.createMany({ data: body.shifts.map((s) => ({ ...s, artistId: id })) }),
    ]);
    return this.prisma.artist.findUnique({ where: { id }, include: artistInclude });
  }
}

// ---------------------------------------------------------------------------
// Website settings: studio details, script accents, prep tips (owner, manager)
// ---------------------------------------------------------------------------

const SITE_KEYS = ['studio', 'accents', 'prep'] as const;

@Controller('admin/site')
@UseGuards(SessionGuard)
@UseInterceptors(AuditInterceptor)
@Roles('MANAGER')
export class SiteSettingsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async all() {
    const rows = await this.prisma.siteSetting.findMany();
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  }

  @Put(':key')
  async put(@Param('key') key: string, @Body(new ZodPipe(z.object({ value: z.any() }))) body: { value: unknown }) {
    if (!SITE_KEYS.includes(key as (typeof SITE_KEYS)[number])) throw new NotFoundException(`Unknown setting "${key}"`);
    if (body.value === undefined || JSON.stringify(body.value).length > 100_000) throw new BadRequestException('Invalid value');
    const value = body.value as Prisma.InputJsonValue;
    await this.prisma.siteSetting.upsert({ where: { key }, update: { value }, create: { key, value } });
    return { key, value };
  }
}

// ---------------------------------------------------------------------------
// Business settings (owner)
// ---------------------------------------------------------------------------

@Controller('admin/settings')
@UseGuards(SessionGuard)
@UseInterceptors(AuditInterceptor)
@Roles('OWNER')
export class SettingsController {
  constructor(private readonly prisma: PrismaService) {}

  /** Every known setting with its saved value (global) or default. */
  @Get()
  async all() {
    const rows = await this.prisma.setting.findMany({ where: { outletId: null } });
    const saved = new Map(rows.map((r) => [r.key, r.value]));
    return Object.fromEntries(Object.entries(SETTINGS).map(([key, def]) => [key, saved.has(key) ? saved.get(key) : def.default]));
  }

  @Put(':key')
  async put(@Param('key') key: string, @Body() body: { value?: unknown }) {
    const def = SETTINGS[key as SettingKey];
    if (!def) throw new NotFoundException(`Unknown setting "${key}"`);
    const value = new ZodPipe(def.schema as z.ZodTypeAny).transform(body?.value) as Prisma.InputJsonValue;
    const existing = await this.prisma.setting.findFirst({ where: { key, outletId: null } });
    if (existing) await this.prisma.setting.update({ where: { id: existing.id }, data: { value } });
    else await this.prisma.setting.create({ data: { key, value } });
    return { key, value };
  }
}

// ---------------------------------------------------------------------------
// Revenue-sharing schemes (owner). A change = a new version for new transactions.
// ---------------------------------------------------------------------------

@Controller('admin/revenue-schemes')
@UseGuards(SessionGuard)
@UseInterceptors(AuditInterceptor)
@Roles('OWNER')
export class RevenueSchemesController {
  constructor(private readonly prisma: PrismaService) {}

  /** The scheme in force for each kind, plus older versions. */
  @Get()
  async list() {
    const schemes = await this.prisma.revenueScheme.findMany({
      include: { lines: { orderBy: { sort: 'asc' } } },
      orderBy: { effectiveFrom: 'desc' },
    });
    const current: Record<string, unknown> = {};
    for (const s of schemes) if (s.isActive && !current[s.kind]) current[s.kind] = s;
    return { current, history: schemes };
  }

  @Post()
  async create(@Body(new ZodPipe(RevenueSchemeSchema)) body: z.infer<typeof RevenueSchemeSchema>, @CurrentUser() me: SessionUser) {
    return this.prisma.$transaction(async (tx) => {
      await tx.revenueScheme.updateMany({ where: { kind: body.kind, isActive: true }, data: { isActive: false } });
      return tx.revenueScheme.create({
        data: {
          kind: body.kind,
          name: body.name,
          createdById: me.id,
          lines: { create: body.lines.map((l, sort) => ({ ...l, sort })) },
        },
        include: { lines: { orderBy: { sort: 'asc' } } },
      });
    });
  }
}

// ---------------------------------------------------------------------------
// Audit log (owner)
// ---------------------------------------------------------------------------

@Controller('admin/audit')
@UseGuards(SessionGuard)
@Roles('OWNER')
export class AuditController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list() {
    return this.prisma.auditLog.findMany({
      take: 200,
      orderBy: { at: 'desc' },
      include: { user: { select: { name: true, email: true } } },
    });
  }
}
