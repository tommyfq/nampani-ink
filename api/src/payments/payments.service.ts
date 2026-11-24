import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { verifySecret } from '../auth/password';
import { SessionUser } from '../common/auth.decorators';
import { PrismaService } from '../db/prisma.service';
import { MailService } from '../mail/mail.service';
import { SettingsService } from '../settings/settings.service';

export interface PayInput {
  methodId: string;
  approvalCode?: string;
  proofFile?: string;
  note?: string;
}
export interface DpInput extends PayInput {
  amount?: number; // defaults to DP % of the quoted price, rounded up
}
export interface FinalInput extends PayInput {
  subtotal?: number; // final price; defaults to the quoted price
  discountBps?: number;
  managerPin?: string; // needed when front desk gives a discount
}

const invalid = (path: string, message: string) => new BadRequestException({ message: 'Invalid data', issues: [{ path, message }] });

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly mail: MailService,
  ) {}

  async posSettings() {
    return {
      dpBps: await this.settings.get<number>('dp.percentBps'),
      discountMaxBps: await this.settings.get<number>('discount.maxBps'),
    };
  }

  /** DP = percentage of the quote, rounded up to a whole Rupiah. */
  dpFor(quoted: bigint, dpBps: number): bigint {
    return (quoted * BigInt(dpBps) + 9999n) / 10000n;
  }

  private assertOutlet(user: SessionUser, outletId: string) {
    if (user.role !== 'OWNER' && !user.outletIds.includes(outletId)) throw new ForbiddenException('You do not have access to this outlet');
  }

  private async method(id: string, outletId: string, input: PayInput) {
    const m = await this.prisma.paymentMethod.findUnique({ where: { id } });
    if (!m || !m.isActive || (m.outletId && m.outletId !== outletId)) throw invalid('methodId', 'Choose a payment method');
    if (m.requiresCode && !input.approvalCode?.trim()) throw invalid('approvalCode', 'Enter the approval code from the card slip');
    if (m.requiresProof && !input.proofFile) throw invalid('proofFile', 'Upload a photo of the transfer / QRIS proof');
    return m;
  }

  private async nextReceipt(tx: Prisma.TransactionClient, outletId: string, outletCode: string) {
    const year = new Date().getUTCFullYear();
    const rows = await tx.$queryRaw<{ lastValue: number }[]>`
      INSERT INTO "NumberSequence" ("outletId", "kind", "year", "lastValue")
      VALUES (${outletId}::uuid, 'receipt', ${year}, 1)
      ON CONFLICT ("outletId", "kind", "year") DO UPDATE SET "lastValue" = "NumberSequence"."lastValue" + 1
      RETURNING "lastValue"`;
    return `NPI-${outletCode}-R-${String(year).slice(2)}-${String(rows[0].lastValue).padStart(5, '0')}`;
  }

  private async loadBooking(id: string, user: SessionUser) {
    const b = await this.prisma.booking.findUnique({ where: { id }, include: { outlet: true, payments: { where: { voidedAt: null } } } });
    if (!b) throw new NotFoundException('Booking not found');
    this.assertOutlet(user, b.outletId);
    if (b.kind !== 'TATTOO') throw new BadRequestException('Consultations are free; only tattoo bookings take payments');
    return b;
  }

  /** Records the DP. The booking becomes Confirmed. */
  async recordDp(bookingId: string, input: DpInput, user: SessionUser) {
    const b = await this.loadBooking(bookingId, user);
    if (!['BOOKED', 'CONFIRMED'].includes(b.status)) throw new BadRequestException('A DP can only be taken for a booked appointment');
    if (b.payments.some((p) => p.kind === 'DP')) throw new BadRequestException('This booking already has a DP');
    if (b.quotedPrice == null || b.quotedPrice <= 0n) throw invalid('quotedPrice', 'Set the quoted price on the booking first');
    const { dpBps } = await this.posSettings();
    const expected = this.dpFor(b.quotedPrice, dpBps);
    const amount = input.amount != null ? BigInt(input.amount) : expected;
    if (amount <= 0n || amount > b.quotedPrice) throw invalid('amount', 'DP must be more than 0 and not above the quoted price');
    const m = await this.method(input.methodId, b.outletId, input);

    const saved = await this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.create({
        data: {
          receiptNo: await this.nextReceipt(tx, b.outletId, b.outlet.code),
          bookingId: b.id,
          outletId: b.outletId,
          kind: 'DP',
          subtotal: b.quotedPrice!,
          amount,
          methodId: m.id,
          methodName: m.name,
          methodType: m.type,
          feeBps: m.feeBps,
          feeAmount: (amount * BigInt(m.feeBps) + 5000n) / 10000n,
          approvalCode: input.approvalCode?.trim() ?? '',
          proofFile: input.proofFile ?? '',
          note: input.note ?? '',
          receivedById: user.id,
        },
      });
      if (b.status === 'BOOKED') {
        await tx.booking.update({ where: { id: b.id }, data: { status: 'CONFIRMED' } });
        await tx.bookingEvent.create({ data: { bookingId: b.id, type: 'status', fromStatus: 'BOOKED', toStatus: 'CONFIRMED', note: `DP ${payment.receiptNo}`, userId: user.id } });
      }
      return payment;
    });
    // Receipt email in the background (only if the customer has an email and it is switched on).
    this.mail.later(() => this.mail.paymentReceipt(saved.id));
    return saved;
  }

  /** Checks a manager / owner PIN for a discount given by front desk. Returns the approver's id. */
  private async approveDiscount(user: SessionUser, outletId: string, pin?: string): Promise<string> {
    if (user.role === 'OWNER' || user.role === 'MANAGER') return user.id;
    if (!pin) throw invalid('managerPin', 'A manager or owner must enter their PIN for a discount');
    const approvers = await this.prisma.user.findMany({
      where: { isActive: true, pinHash: { not: null }, OR: [{ role: 'OWNER' }, { role: 'MANAGER', outlets: { some: { outletId } } }] },
      select: { id: true, pinHash: true },
    });
    for (const a of approvers) if (await verifySecret(pin, a.pinHash)) return a.id;
    throw invalid('managerPin', 'Wrong PIN');
  }

  /** Records the remaining payment after the session. The booking becomes Completed. */
  async recordFinal(bookingId: string, input: FinalInput, user: SessionUser) {
    const b = await this.loadBooking(bookingId, user);
    if (b.status !== 'CHECKED_IN') throw new BadRequestException('Check the customer in before taking the final payment');
    if (b.payments.some((p) => p.kind === 'FINAL')) throw new BadRequestException('This booking is already paid');
    const subtotal = input.subtotal != null ? BigInt(input.subtotal) : b.quotedPrice;
    if (subtotal == null || subtotal <= 0n) throw invalid('subtotal', 'Enter the final price');
    const { discountMaxBps } = await this.posSettings();
    const bps = input.discountBps ?? 0;
    if (bps < 0 || bps > discountMaxBps) throw invalid('discountBps', `Discount can be at most ${discountMaxBps / 100}%`);
    const approverId = bps > 0 ? await this.approveDiscount(user, b.outletId, input.managerPin) : null;
    const discount = (subtotal * BigInt(bps) + 5000n) / 10000n;
    const dpPaid = b.payments.filter((p) => p.kind === 'DP').reduce((s, p) => s + p.amount, 0n);
    const amount = subtotal - discount - dpPaid;
    if (amount < 0n) throw invalid('subtotal', 'The DP is more than the price after discount');
    const m = await this.method(input.methodId, b.outletId, input);

    const saved = await this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.create({
        data: {
          receiptNo: await this.nextReceipt(tx, b.outletId, b.outlet.code),
          bookingId: b.id,
          outletId: b.outletId,
          kind: 'FINAL',
          subtotal,
          discount,
          amount,
          methodId: m.id,
          methodName: m.name,
          methodType: m.type,
          feeBps: m.feeBps,
          feeAmount: (amount * BigInt(m.feeBps) + 5000n) / 10000n,
          approvalCode: input.approvalCode?.trim() ?? '',
          proofFile: input.proofFile ?? '',
          note: input.note ?? '',
          receivedById: user.id,
          discountApprovedById: approverId,
        },
      });
      await tx.booking.update({ where: { id: b.id }, data: { status: 'COMPLETED', quotedPrice: subtotal } });
      await tx.bookingEvent.create({ data: { bookingId: b.id, type: 'status', fromStatus: 'CHECKED_IN', toStatus: 'COMPLETED', note: `Paid ${payment.receiptNo}`, userId: user.id } });
      return payment;
    });
    // Receipt email in the background (only if the customer has an email and it is switched on).
    this.mail.later(() => this.mail.paymentReceipt(saved.id));
    return saved;
  }

  /** Cancels a payment recorded by mistake (owner / manager). The receipt is kept, marked VOID. */
  async void(paymentId: string, reason: string, user: SessionUser) {
    const p = await this.prisma.payment.findUnique({ where: { id: paymentId }, include: { booking: true } });
    if (!p) throw new NotFoundException('Payment not found');
    this.assertOutlet(user, p.outletId);
    if (p.voidedAt) throw new BadRequestException('Already void');
    if (!reason.trim()) throw invalid('reason', 'Add a short reason');
    return this.prisma.$transaction(async (tx) => {
      const voided = await tx.payment.update({ where: { id: p.id }, data: { voidedAt: new Date(), voidedById: user.id, voidReason: reason.trim() } });
      const back = p.kind === 'FINAL' && p.booking.status === 'COMPLETED' ? 'CHECKED_IN' : p.kind === 'DP' && p.booking.status === 'CONFIRMED' ? 'BOOKED' : null;
      if (back) {
        await tx.booking.update({ where: { id: p.bookingId }, data: { status: back } });
        await tx.bookingEvent.create({ data: { bookingId: p.bookingId, type: 'status', fromStatus: p.booking.status, toStatus: back, note: `Payment ${p.receiptNo} void: ${reason.trim()}`, userId: user.id } });
      }
      return voided;
    });
  }
}
