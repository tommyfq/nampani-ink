import { PrismaService } from '../db/prisma.service';
import { renderReceipt } from './receipt.pdf';

/** Loads a payment and renders its A4 receipt PDF (used by the POS download and by receipt emails). */
export async function buildReceipt(prisma: PrismaService, id: string) {
    const p = await prisma.payment.findUnique({
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
    if (!p) return null;
    const b = p.booking;
    const studio = await prisma.siteSetting.findUnique({ where: { key: 'studio' } });
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
    return { pdf, p, outletId: p.outletId, fileName: `Kuitansi-${p.receiptNo}.pdf` };
}
