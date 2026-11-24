import { z } from 'zod';

export const slug = z
  .string()
  .min(1)
  .max(60)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and dashes');
const text = (max = 2000) => z.string().max(max);
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM');
const digits = z.string().regex(/^\d{0,16}$/, 'Digits only, e.g. 6281234567890');
/** Basis points: 100 = 1%. */
export const bps = (max = 10000) =>
  z.number().int().min(0, 'Cannot be negative').max(max, `Cannot be above ${max / 100}%`);

export const OutletSchema = z.object({
  code: z.string().min(2).max(6).regex(/^[A-Z0-9]+$/, 'Uppercase letters and numbers'),
  slug,
  name: text(80).min(1),
  badge: text(40).default(''),
  area: text(120).default(''),
  street: text(200).default(''),
  locality: text(80).default(''),
  region: text(80).default(''),
  postalCode: text(12).default(''),
  country: z.string().length(2).default('ID'),
  lat: z.number().min(-90).max(90).nullable().optional(),
  lng: z.number().min(-180).max(180).nullable().optional(),
  mapsUrl: z.string().url().or(z.literal('')).default(''),
  whatsapp: digits.default(''),
  timezone: text(40).default('Asia/Makassar'),
  hoursText: text(80).default(''),
  opens: time.default('10:00'),
  closes: time.default('22:00'),
  intro: text(600).default(''),
  receiptFooter: text(300).default(''),
  sort: z.number().int().default(0),
  isActive: z.boolean().default(true),
});

export const StyleSchema = z.object({
  slug,
  name: text(80).min(1),
  badge: text(40).default(''),
  motif: text(40).default('leaf'),
  image: text(300).nullable().optional(),
  description: text(1000).default(''),
  sort: z.number().int().default(0),
  isPublic: z.boolean().default(true),
});

export const GallerySchema = z.object({
  code: z.string().min(1).max(20),
  artistId: z.string().uuid().nullable().optional(),
  styleId: z.string().uuid().nullable().optional(),
  outletId: z.string().uuid().nullable().optional(),
  image: text(300).nullable().optional(),
  placement: text(60).default(''),
  size: text(40).default(''),
  motif: text(40).default('leaf'),
  caption: text(500).default(''),
  sort: z.number().int().default(0),
  isPublic: z.boolean().default(true),
});

export const FaqSchema = z.object({
  question: text(300).min(1),
  answer: text(2000).min(1),
  sort: z.number().int().default(0),
  isPublic: z.boolean().default(true),
});

export const ReviewSchema = z.object({
  name: text(80).min(1),
  text: text(1000).min(1),
  artist: text(80).default(''),
  sort: z.number().int().default(0),
  isPublic: z.boolean().default(true),
});

export const PaymentMethodSchema = z.object({
  name: text(60).min(1),
  type: z.enum(['CASH', 'CARD', 'TRANSFER', 'QRIS']),
  feeBps: bps(2000).default(0),
  requiresProof: z.boolean().default(false),
  requiresCode: z.boolean().default(false),
  outletId: z.string().uuid().nullable().optional(),
  sort: z.number().int().default(0),
  isActive: z.boolean().default(true),
});

export const ArtistSchema = z.object({
  slug,
  displayName: text(80).min(1),
  role: text(60).default(''),
  bio: text(1000).default(''),
  photo: text(300).nullable().optional(),
  motif: text(40).default('leaf'),
  instagram: text(60).default(''),
  whatsapp: digits.default(''),
  years: z.number().int().min(0).max(80).default(0),
  commissionBps: bps(4500).default(4500),
  payoutPeriodDays: z.number().int().min(1).max(90).default(14),
  isPublic: z.boolean().default(true),
  isActive: z.boolean().default(true),
  sort: z.number().int().default(0),
  userId: z.string().uuid().nullable().optional(),
  homeOutletId: z.string().uuid().nullable().optional(),
  specialtyIds: z.array(z.string().uuid()).max(30).optional(),
});

export const ShiftsSchema = z.object({
  shifts: z
    .array(
      z
        .object({ outletId: z.string().uuid(), weekday: z.number().int().min(0).max(6), startTime: time, endTime: time })
        .refine((s) => s.startTime < s.endTime, 'Shift must end after it starts'),
    )
    .max(50),
});

const password = z.string().min(10, 'At least 10 characters').max(200);

export const UserCreateSchema = z.object({
  name: text(80).min(1),
  email: z.string().email().max(200).transform((e) => e.trim().toLowerCase()),
  phone: digits.default(''),
  role: z.enum(['OWNER', 'MANAGER', 'FRONT_DESK', 'ARTIST']),
  password,
  outletIds: z.array(z.string().uuid()).max(50).default([]),
});

export const UserUpdateSchema = z.object({
  name: text(80).min(1).optional(),
  phone: digits.optional(),
  role: z.enum(['OWNER', 'MANAGER', 'FRONT_DESK', 'ARTIST']).optional(),
  isActive: z.boolean().optional(),
  password: password.optional(),
  pin: z.string().regex(/^\d{4,8}$/, '4 to 8 digits').nullable().optional(),
  outletIds: z.array(z.string().uuid()).max(50).optional(),
});

export const RevenueSchemeSchema = z
  .object({
    kind: z.enum(['TATTOO', 'PRODUCT', 'FORFEITED_DP']),
    name: text(80).min(1),
    lines: z
      .array(
        z.object({
          key: z.string().regex(/^[a-z0-9_]{1,40}$/, 'lowercase_with_underscores'),
          label: text(60).min(1),
          bps: bps(),
          group: z.string().max(30).default(''),
          isArtist: z.boolean().default(false),
          takesFees: z.boolean().default(false),
          takesRemainder: z.boolean().default(false),
          payeeUserId: z.string().uuid().nullable().optional(),
        }),
      )
      .min(1)
      .max(20),
  })
  .superRefine((s, ctx) => {
    const total = s.lines.reduce((sum, l) => sum + l.bps, 0);
    if (total !== 10000) ctx.addIssue({ code: 'custom', path: ['lines'], message: `Shares must add up to 100% (now ${total / 100}%)` });
    if (new Set(s.lines.map((l) => l.key)).size !== s.lines.length) ctx.addIssue({ code: 'custom', path: ['lines'], message: 'Each key must be unique' });
    if (s.lines.filter((l) => l.takesRemainder).length > 1) ctx.addIssue({ code: 'custom', path: ['lines'], message: 'Only one share can take the rounding remainder' });
    const artist = s.lines.filter((l) => l.isArtist);
    if (s.kind !== 'PRODUCT' && artist.length !== 1) ctx.addIssue({ code: 'custom', path: ['lines'], message: 'Exactly one share must be the artist' });
    if (s.kind === 'TATTOO' && artist[0] && artist[0].bps > 4500) ctx.addIssue({ code: 'custom', path: ['lines'], message: 'Artist share cannot be above 45%' });
  });

/** Known business settings with their validation and default values. */
export const SETTINGS = {
  'dp.percentBps': { schema: bps(10000), default: 1000 },
  'discount.maxBps': { schema: bps(10000), default: 1000 },
  'booking.autoCancelHours': { schema: z.number().int().min(1).max(168), default: 24 },
  'reminder.hoursBefore': { schema: z.number().int().min(1).max(72), default: 16 },
  'reminder.windowStart': { schema: time, default: '08:00' },
  'reminder.windowEnd': { schema: time, default: '20:00' },
  'investor.payoutPeriodDays': { schema: z.number().int().min(1).max(366), default: 30 },
  // Main WhatsApp switches (owner only). Off until Convia / the internal number are connected.
  'whatsapp.customerEnabled': { schema: z.boolean(), default: false },
  'whatsapp.internalEnabled': { schema: z.boolean(), default: false },
  // Per-message switches; only used while whatsapp.customerEnabled is on.
  'whatsapp.consultationReminder': { schema: z.boolean(), default: true },
  'whatsapp.appointmentReminder': { schema: z.boolean(), default: true },
  'whatsapp.dpConfirmation': { schema: z.boolean(), default: true },
  'whatsapp.receipt': { schema: z.boolean(), default: true },
  // WhatsApp message templates (Bahasa Indonesia). Fields: {nama} {studio} {outlet} {hari} {tanggal} {jam}
  // {artist} {kode} {alamat} {maps} {jumlah} {total} {sisa} {kuitansi}
  'template.consultationReminder': {
    schema: z.string().min(1).max(2000),
    default:
      'Halo {nama}, ini pengingat dari {studio} {outlet}.\n\nJadwal konsultasi Anda: {hari}, {tanggal} pukul {jam} WITA.\nKode booking: {kode}\n\nMohon balas pesan ini dengan *YA* untuk konfirmasi, atau beri tahu kami jika ingin mengubah jadwal.\n\nLokasi: {alamat}\n{maps}\n\nTerima kasih.',
  },
  'template.dpConfirmation': {
    schema: z.string().min(1).max(2000),
    default:
      'Halo {nama}, DP sebesar {jumlah} sudah kami terima. Terima kasih!\n\nJadwal tato Anda: {hari}, {tanggal} pukul {jam} WITA bersama {artist} di {studio} {outlet}.\nKode booking: {kode}\nNo. kuitansi: {kuitansi}\nSisa pembayaran setelah sesi: {sisa}\n\nKuitansi kami lampirkan. DP tidak dapat dikembalikan bila jadwal dibatalkan.',
  },
  'template.appointmentReminder': {
    schema: z.string().min(1).max(2000),
    default:
      'Halo {nama}, pengingat jadwal tato Anda di {studio} {outlet}:\n\n{hari}, {tanggal} pukul {jam} WITA bersama {artist}.\nKode booking: {kode}\n\nSebelum sesi: makan yang cukup, istirahat yang cukup, dan hindari alkohol 24 jam sebelumnya.\n\nMohon balas *YA* untuk konfirmasi kehadiran.\n\nLokasi: {alamat}\n{maps}',
  },
  'template.receipt': {
    schema: z.string().min(1).max(2000),
    default:
      'Halo {nama}, terima kasih sudah tato di {studio} {outlet}!\n\nPembayaran {jumlah} sudah kami terima.\nTotal harga: {total}\nNo. kuitansi: {kuitansi}\n\nKuitansi kami lampirkan. Jangan lupa rawat tato Anda sesuai petunjuk dari artist ya.',
  },
} as const;
export type SettingKey = keyof typeof SETTINGS;
