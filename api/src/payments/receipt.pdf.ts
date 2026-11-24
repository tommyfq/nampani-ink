import PDFDocument from 'pdfkit';
import { rupiah } from '../bookings/booking.rules';

export interface ReceiptData {
  studioName: string;
  outlet: { name: string; street: string; locality: string; region: string; whatsapp: string; receiptFooter: string };
  receiptNo: string;
  paidAt: Date;
  timezone: string;
  kind: 'DP' | 'FINAL';
  bookingCode: string;
  customer: { name: string; phone: string };
  artist: string;
  tattoo: string; // style · placement · size
  appointment: Date | null;
  subtotal: bigint;
  discount: bigint;
  discountPct: number;
  dpPaidBefore: { receiptNo: string; amount: bigint }[];
  amount: bigint;
  remainingAfterDp: bigint | null;
  method: string;
  approvalCode: string;
  receivedBy: string;
  voided: { at: Date; reason: string } | null;
}

const C = { ink: '#211F1C', muted: '#665744', accent: '#795A43', soft: '#B5A58D', line: '#E1D6C2', bg: '#F1EADB', danger: '#A4442C' };

const fmtDate = (d: Date, tz: string) =>
  d.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: tz });
const fmtTime = (d: Date, tz: string) => d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: tz });

/** Renders an A4 receipt (kuitansi) in Bahasa Indonesia. */
export function renderReceipt(r: ReceiptData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50, info: { Title: `Kuitansi ${r.receiptNo}`, Author: r.studioName } });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const L = 50;
    const R = doc.page.width - 50;
    const W = R - L;

    // Header
    doc.fillColor(C.ink).font('Times-Roman').fontSize(26).text(r.studioName.toUpperCase(), L, 50, { characterSpacing: 2 });
    doc.font('Helvetica').fontSize(9).fillColor(C.muted);
    doc.text(r.outlet.name, L, 84);
    doc.text([r.outlet.street, r.outlet.locality, r.outlet.region].filter(Boolean).join(', '), L, 96, { width: 300 });
    if (r.outlet.whatsapp) doc.text(`WhatsApp +${r.outlet.whatsapp}`, L, 108);

    doc.font('Helvetica-Bold').fontSize(14).fillColor(C.ink).text('KUITANSI PEMBAYARAN', L, 50, { width: W, align: 'right' });
    doc.font('Helvetica').fontSize(9).fillColor(C.muted);
    const meta: [string, string][] = [
      ['No. Kuitansi', r.receiptNo],
      ['Tanggal', `${fmtDate(r.paidAt, r.timezone)}, ${fmtTime(r.paidAt, r.timezone)}`],
      ['Kode Booking', r.bookingCode],
    ];
    meta.forEach(([k, v], i) => {
      doc.fillColor(C.muted).text(k, R - 260, 74 + i * 13, { width: 90 });
      doc.fillColor(C.ink).text(v, R - 170, 74 + i * 13, { width: 170, align: 'right' });
    });
    doc.moveTo(L, 135).lineTo(R, 135).lineWidth(1.5).strokeColor(C.ink).stroke();

    // Customer / appointment
    let y = 152;
    const block = (label: string, lines: string[], x: number, w: number) => {
      doc.font('Helvetica').fontSize(8).fillColor(C.accent).text(label.toUpperCase(), x, y, { width: w, characterSpacing: 1 });
      doc.font('Helvetica-Bold').fontSize(11).fillColor(C.ink).text(lines[0] ?? '', x, y + 13, { width: w });
      doc.font('Helvetica').fontSize(9).fillColor(C.muted);
      lines.slice(1).forEach((l, i) => doc.text(l, x, y + 29 + i * 12, { width: w }));
    };
    block('Diterima dari', [r.customer.name, r.customer.phone ? `+${r.customer.phone}` : ''], L, 240);
    block('Untuk', [r.kind === 'DP' ? 'Down Payment (DP) Tato' : 'Pelunasan Tato', `Artist: ${r.artist}`, r.appointment ? `Jadwal: ${fmtDate(r.appointment, r.timezone)}, ${fmtTime(r.appointment, r.timezone)}` : ''], L + 270, W - 270);
    y += 82;

    // Items table
    doc.rect(L, y, W, 22).fill(C.bg);
    doc.font('Helvetica-Bold').fontSize(8).fillColor(C.muted).text('KETERANGAN', L + 10, y + 7).text('JUMLAH', R - 130, y + 7, { width: 120, align: 'right' });
    y += 30;
    const row = (label: string, value: string, opts: { bold?: boolean; color?: string; sub?: string } = {}) => {
      doc.font(opts.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(opts.bold ? 11 : 10).fillColor(opts.color ?? C.ink);
      doc.text(label, L + 10, y, { width: W - 160 });
      doc.text(value, R - 130, y, { width: 120, align: 'right' });
      const h = doc.heightOfString(label, { width: W - 160 });
      if (opts.sub) {
        doc.font('Helvetica').fontSize(8).fillColor(C.muted).text(opts.sub, L + 10, y + h + 2, { width: W - 160 });
        y += 12;
      }
      y += h + 10;
      doc.moveTo(L, y - 5).lineTo(R, y - 5).lineWidth(0.5).strokeColor(C.line).stroke();
    };

    row('Harga tato', rupiah(r.subtotal), { sub: r.tattoo || undefined });
    if (r.kind === 'DP') {
      row(`Down Payment (DP)`, rupiah(r.amount), { sub: 'Dibayar sekarang untuk mengunci jadwal' });
    } else {
      if (r.discount > 0n) row(`Diskon ${r.discountPct}%`, `- ${rupiah(r.discount)}`);
      for (const dp of r.dpPaidBefore) row('DP sudah dibayar', `- ${rupiah(dp.amount)}`, { sub: `Kuitansi ${dp.receiptNo}` });
    }
    y += 4;
    doc.moveTo(L, y).lineTo(R, y).lineWidth(1.5).strokeColor(C.ink).stroke();
    y += 10;
    row('TOTAL DIBAYAR', rupiah(r.amount), { bold: true });
    if (r.kind === 'DP' && r.remainingAfterDp != null) row('Sisa pembayaran setelah sesi', rupiah(r.remainingAfterDp), { color: C.muted });

    // Payment info
    y += 10;
    doc.rect(L, y, W, 58).fill(C.bg);
    doc.font('Helvetica').fontSize(8).fillColor(C.accent).text('METODE PEMBAYARAN', L + 14, y + 12, { characterSpacing: 1 });
    doc.font('Helvetica-Bold').fontSize(11).fillColor(C.ink).text(r.method, L + 14, y + 26);
    if (r.approvalCode) doc.font('Helvetica').fontSize(9).fillColor(C.muted).text(`Kode approval: ${r.approvalCode}`, L + 14, y + 41);
    doc.font('Helvetica').fontSize(8).fillColor(C.accent).text('DITERIMA OLEH', L + 290, y + 12, { characterSpacing: 1 });
    doc.font('Helvetica-Bold').fontSize(11).fillColor(C.ink).text(r.receivedBy, L + 290, y + 26);
    y += 80;

    // Notes
    doc.font('Helvetica').fontSize(8.5).fillColor(C.muted);
    const notes = [
      r.kind === 'DP' ? 'DP tidak dapat dikembalikan bila jadwal dibatalkan atau pelanggan tidak datang.' : 'Terima kasih sudah tato di ' + r.studioName + '. Rawat tato Anda sesuai petunjuk dari artist.',
      r.outlet.receiptFooter,
    ].filter(Boolean);
    notes.forEach((n) => {
      doc.text(n, L, y, { width: W });
      y += doc.heightOfString(n, { width: W }) + 6;
    });

    // VOID stamp
    if (r.voided) {
      doc.save();
      doc.rotate(-25, { origin: [doc.page.width / 2, 400] });
      doc.font('Helvetica-Bold').fontSize(90).fillColor(C.danger).opacity(0.18).text('BATAL', 0, 360, { width: doc.page.width, align: 'center' });
      doc.restore();
      doc.font('Helvetica-Bold').fontSize(10).fillColor(C.danger).opacity(1).text(`Kuitansi ini DIBATALKAN pada ${fmtDate(r.voided.at, r.timezone)}: ${r.voided.reason}`, L, y + 6, { width: W });
    }

    doc.font('Helvetica').fontSize(7.5).fillColor(C.soft).text('Kuitansi ini dibuat otomatis oleh sistem dan sah tanpa tanda tangan.', L, doc.page.height - 70, { width: W, align: 'center' });
    doc.end();
  });
}
