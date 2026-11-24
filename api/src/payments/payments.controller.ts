import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Module,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { randomUUID } from 'crypto';
import { createReadStream, existsSync } from 'fs';
import { mkdir, writeFile } from 'fs/promises';
import { memoryStorage } from 'multer';
import { join, resolve } from 'path';
import { z } from 'zod';
import { SessionGuard } from '../auth/session.guard';
import { AuditInterceptor } from '../common/audit.interceptor';
import { CurrentUser, Roles, SessionUser } from '../common/auth.decorators';
import { ZodPipe } from '../common/zod.pipe';
import { PrismaService } from '../db/prisma.service';
import { sniff, UPLOAD_DIR } from '../uploads/uploads.service';
import { PaymentsService } from './payments.service';
import { renderReceipt } from './receipt.pdf';

/** Private files (payment proofs). Never served by the public /uploads route. */
export const PRIVATE_DIR = resolve(process.env.PRIVATE_DIR ?? join(UPLOAD_DIR, '..', 'private'));
const PROOF_DIR = join(PRIVATE_DIR, 'proofs');
const FILE_RE = /^[0-9a-f-]{36}\.(jpg|png|webp|gif|heic)$/;

const pay = {
  methodId: z.string().uuid(),
  approvalCode: z.string().max(40).optional(),
  proofFile: z.string().regex(FILE_RE, 'Upload the proof again').optional(),
  note: z.string().max(300).optional(),
};
const DpSchema = z.object({ ...pay, amount: z.number().int().positive().max(1_000_000_000).optional() });
const FinalSchema = z.object({
  ...pay,
  subtotal: z.number().int().positive().max(1_000_000_000).optional(),
  discountBps: z.number().int().min(0).max(10000).optional(),
  managerPin: z.string().regex(/^\d{4,8}$/, '4 to 8 digits').optional(),
});
const VoidSchema = z.object({ reason: z.string().max(300) });

@Controller('pos')
@UseGuards(SessionGuard)
@UseInterceptors(AuditInterceptor)
@Roles('MANAGER', 'FRONT_DESK')
export class PaymentsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly payments: PaymentsService,
  ) {}

  /** What the POS needs to take payments: methods for the outlet, DP %, discount limit. */
  @Get('meta')
  async meta(@Query('outletId') outletId: string) {
    const methods = await this.prisma.paymentMethod.findMany({
      where: { isActive: true, OR: [{ outletId: null }, ...(outletId ? [{ outletId }] : [])] },
      orderBy: [{ sort: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true, type: true, feeBps: true, requiresCode: true, requiresProof: true },
    });
    return { methods, ...(await this.payments.posSettings()) };
  }

  @Post('bookings/:id/dp')
  dp(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(DpSchema)) body: z.infer<typeof DpSchema>, @CurrentUser() user: SessionUser) {
    return this.payments.recordDp(id, body, user);
  }

  @Post('bookings/:id/final')
  final(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(FinalSchema)) body: z.infer<typeof FinalSchema>, @CurrentUser() user: SessionUser) {
    return this.payments.recordFinal(id, body, user);
  }

  @Post('payments/:id/void')
  @Roles('MANAGER')
  void(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(VoidSchema)) body: z.infer<typeof VoidSchema>, @CurrentUser() user: SessionUser) {
    return this.payments.void(id, body.reason, user);
  }

  /** Upload a transfer / QRIS proof photo. Returns the private file name to send with the payment. */
  @Post('uploads/proof')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1 } }))
  async proof(@UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('Choose a photo');
    const kind = sniff(file.buffer);
    if (!kind) throw new BadRequestException('Upload a JPG, PNG, WEBP or HEIC photo');
    await mkdir(PROOF_DIR, { recursive: true });
    const name = `${randomUUID()}.${kind.ext}`;
    await writeFile(join(PROOF_DIR, name), file.buffer, { flag: 'wx' });
    return { file: name };
  }

  /** Staff-only view of a proof photo. */
  @Get('files/proofs/:name')
  async proofFile(@Param('name') name: string, @CurrentUser() user: SessionUser, @Res({ passthrough: true }) res: Response) {
    if (!FILE_RE.test(name)) throw new NotFoundException();
    const p = await this.prisma.payment.findFirst({ where: { proofFile: name }, select: { outletId: true } });
    if (p && user.role !== 'OWNER' && !user.outletIds.includes(p.outletId)) throw new ForbiddenException();
    const path = join(PROOF_DIR, name);
    if (!existsSync(path)) throw new NotFoundException();
    res.set({ 'Cache-Control': 'private, max-age=3600', 'X-Content-Type-Options': 'nosniff' });
    return new StreamableFile(createReadStream(path), { type: name.endsWith('png') ? 'image/png' : name.endsWith('webp') ? 'image/webp' : 'image/jpeg' });
  }

  /** A4 receipt (kuitansi) PDF in Bahasa Indonesia. */
  @Get('payments/:id/receipt')
  async receipt(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: SessionUser, @Res({ passthrough: true }) res: Response) {
    const p = await this.prisma.payment.findUnique({
      where: { id },
      include: {
        receivedBy: { select: { name: true } },
        booking: {
          include: {
            outlet: true,
            customer: true,
            artist: { select: { displayName: true } },
            style: { select: { name: true } },
            payments: { where: { voidedAt: null, kind: 'DP' }, orderBy: { paidAt: 'asc' } },
          },
        },
      },
    });
    if (!p) throw new NotFoundException('Payment not found');
    if (user.role !== 'OWNER' && !user.outletIds.includes(p.outletId)) throw new ForbiddenException();
    const b = p.booking;
    const studio = await this.prisma.siteSetting.findUnique({ where: { key: 'studio' } });
    const studioName = (studio?.value as { name?: string } | null)?.name ?? 'Nampani Ink';
    const pdf = await renderReceipt({
      studioName,
      outlet: { name: b.outlet.name, street: b.outlet.street, locality: b.outlet.locality, region: b.outlet.region, whatsapp: b.outlet.whatsapp, receiptFooter: b.outlet.receiptFooter },
      receiptNo: p.receiptNo,
      paidAt: p.paidAt,
      timezone: b.outlet.timezone,
      kind: p.kind,
      bookingCode: b.code,
      customer: { name: b.customer.name, phone: b.customer.phone },
      artist: b.artist?.displayName ?? '-',
      tattoo: [b.style?.name, b.placement, b.size].filter(Boolean).join(' · '),
      appointment: b.startsAt,
      subtotal: p.subtotal,
      discount: p.discount,
      discountPct: p.subtotal > 0n ? Math.round((Number(p.discount) * 10000) / Number(p.subtotal)) / 100 : 0,
      dpPaidBefore: p.kind === 'FINAL' ? b.payments.map((d) => ({ receiptNo: d.receiptNo, amount: d.amount })) : [],
      amount: p.amount,
      remainingAfterDp: p.kind === 'DP' ? p.subtotal - p.amount : null,
      method: p.methodName,
      approvalCode: p.approvalCode,
      receivedBy: p.receivedBy?.name ?? '-',
      voided: p.voidedAt ? { at: p.voidedAt, reason: p.voidReason } : null,
    });
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="Kuitansi-${p.receiptNo}.pdf"`, 'Cache-Control': 'private, no-store' });
    return new StreamableFile(pdf);
  }
}

@Module({ controllers: [PaymentsController], providers: [PaymentsService], exports: [PaymentsService] })
export class PaymentsModule {}
