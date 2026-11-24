import { Body, Controller, Get, Module, Post, Query, UseGuards, UseInterceptors } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import { SessionGuard } from '../auth/session.guard';
import { AuditInterceptor } from '../common/audit.interceptor';
import { Roles } from '../common/auth.decorators';
import { ZodPipe } from '../common/zod.pipe';
import { PrismaService } from '../db/prisma.service';
import { MailService } from './mail.service';
import { EMAIL_FIELDS, EMAIL_INFO, EMAIL_TYPES } from './mail.templates';

const Draft = z.object({
  type: z.enum(EMAIL_TYPES),
  subject: z.string().trim().min(1).max(200).optional(),
  body: z.string().trim().min(1).max(4000).optional(),
});
const TestSchema = Draft.extend({ to: z.string().trim().toLowerCase().email('Enter a valid email').max(200) });

/** Admin → Emails: switches live in Settings; here owners see the status, edit wording, preview and send tests. */
@Controller('admin/emails')
@UseGuards(SessionGuard)
@Roles('MANAGER')
export class MailController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  @Get('status')
  async status() {
    const since = new Date(Date.now() - 7 * 864e5);
    const counts = await this.prisma.emailLog.groupBy({ by: ['status'], where: { createdAt: { gt: since }, type: { not: 'test' } }, _count: true });
    return {
      ...this.mail.status(),
      lastWeek: Object.fromEntries(counts.map((c) => [c.status, c._count])),
      types: EMAIL_TYPES.map((t) => ({ type: t, ...EMAIL_INFO[t] })),
      fields: EMAIL_FIELDS,
    };
  }

  @Get('log')
  log(@Query('status') status?: string) {
    return this.prisma.emailLog.findMany({
      where: status ? { status } : {},
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: { id: true, type: true, to: true, subject: true, status: true, error: true, attempts: true, createdAt: true, sentAt: true, booking: { select: { id: true, code: true } } },
    });
  }

  /** Renders an email with sample details, using the wording being edited (not yet saved). */
  @Post('preview')
  @Roles('OWNER')
  async preview(@Body(new ZodPipe(Draft)) body: z.infer<typeof Draft>) {
    const current = await this.mail.template(body.type);
    const s = await this.mail.sample(body.type, { subject: body.subject ?? current.subject, body: body.body ?? current.body });
    return { subject: s.subject, html: s.html };
  }

  @Post('test')
  @Roles('OWNER')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @UseInterceptors(AuditInterceptor)
  async test(@Body(new ZodPipe(TestSchema)) body: z.infer<typeof TestSchema>) {
    const current = await this.mail.template(body.type);
    const row = await this.mail.sendTest(body.type, body.to, { subject: body.subject ?? current.subject, body: body.body ?? current.body });
    return { status: row?.status, error: row?.error ?? '' };
  }
}

@Module({ controllers: [MailController] })
export class MailAdminModule {}
