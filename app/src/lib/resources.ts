import type { Role } from './api';

export type FieldType = 'text' | 'textarea' | 'number' | 'percent' | 'bool' | 'select' | 'ref' | 'refs' | 'password' | 'pin';

export interface Field {
  key: string;
  label: string;
  type?: FieldType;
  options?: { value: string; label: string }[];
  /** For ref/refs: API path to load choices and how to label them. */
  ref?: { path: string; label: (row: any) => string };
  required?: boolean;
  full?: boolean;
  help?: string;
  /** Only on create / only on edit. */
  createOnly?: boolean;
  editOnly?: boolean;
  /** Turns the saved row into the form value (e.g. outlets[] → outletIds). */
  read?: (row: any) => unknown;
}

export interface Column {
  label: string;
  value: (row: any, lookups: Record<string, Map<string, string>>) => string;
}

export interface Resource {
  title: string;
  singular: string;
  path: string;
  roles: Role[];
  canDelete?: boolean;
  /** Shown under the Delete button. */
  deleteHelp?: string;
  intro?: string;
  columns: Column[];
  fields: Field[];
}

const yes = (v: boolean) => (v ? 'Yes' : 'No');
const ROLE_LABEL: Record<string, string> = { OWNER: 'Owner', MANAGER: 'Manager', FRONT_DESK: 'Front desk', ARTIST: 'Artist' };
const outletRef = { path: '/admin/outlets', label: (o: any) => `${o.name} (${o.code})` };
const styleRef = { path: '/admin/styles', label: (s: any) => s.name };
const artistRef = { path: '/admin/artists', label: (a: any) => a.displayName };

export const RESOURCES: Record<string, Resource> = {
  outlets: {
    title: 'Outlets',
    singular: 'outlet',
    path: '/admin/outlets',
    roles: ['OWNER'],
    intro: 'Studio branches. Each one appears on the website and has its own bookings, staff and reports.',
    columns: [
      { label: 'Name', value: (r) => r.name },
      { label: 'Code', value: (r) => r.code },
      { label: 'WhatsApp', value: (r) => r.whatsapp },
      { label: 'Hours', value: (r) => r.hoursText },
      { label: 'Active', value: (r) => yes(r.isActive) },
    ],
    fields: [
      { key: 'name', label: 'Name', required: true },
      { key: 'code', label: 'Code (used in booking numbers)', required: true, help: 'e.g. CGU' },
      { key: 'slug', label: 'Web address', required: true, help: 'e.g. canggu → /studios/canggu' },
      { key: 'badge', label: 'Badge', help: 'e.g. Flagship' },
      { key: 'whatsapp', label: 'WhatsApp number', help: 'Digits only, e.g. 6281234567890' },
      { key: 'hoursText', label: 'Hours (shown on website)' },
      { key: 'opens', label: 'Opens', help: 'HH:MM' },
      { key: 'closes', label: 'Closes', help: 'HH:MM' },
      { key: 'street', label: 'Street', full: true },
      { key: 'locality', label: 'Area' },
      { key: 'region', label: 'Region' },
      { key: 'postalCode', label: 'Postal code' },
      { key: 'mapsUrl', label: 'Google Maps link' },
      { key: 'lat', label: 'Latitude', type: 'number' },
      { key: 'lng', label: 'Longitude', type: 'number' },
      { key: 'intro', label: 'Intro text', type: 'textarea', full: true },
      { key: 'receiptFooter', label: 'Receipt footer', type: 'textarea', full: true },
      { key: 'sort', label: 'Order', type: 'number' },
      { key: 'isActive', label: 'Active', type: 'bool' },
    ],
  },
  users: {
    title: 'Staff',
    singular: 'staff login',
    path: '/admin/users',
    roles: ['OWNER'],
    canDelete: true,
    deleteHelp: 'Only logins that were never used for bookings or payments can be deleted. For anyone else, turn off "Active": they can no longer log in and old records keep their name.',
    intro: 'One login per person. Owners see everything; other roles only see their outlets. To remove someone who has worked here, turn off "Active".',
    columns: [
      { label: 'Name', value: (r) => r.name },
      { label: 'Email', value: (r) => r.email },
      { label: 'Role', value: (r) => ROLE_LABEL[r.role] ?? r.role },
      { label: 'Outlets', value: (r, l) => r.outlets.map((o: any) => l.outletIds?.get(o.outletId) ?? '?').join(', ') || (r.role === 'OWNER' ? 'All' : '—') },
      { label: 'PIN', value: (r) => (r.role === 'OWNER' || r.role === 'MANAGER' ? (r.hasPin ? 'Set' : 'Not set') : '—') },
      { label: 'Last login', value: (r) => (r.lastLoginAt ? new Date(r.lastLoginAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }) : 'Never') },
      { label: 'Active', value: (r) => yes(r.isActive) },
    ],
    fields: [
      { key: 'name', label: 'Name', required: true },
      { key: 'email', label: 'Email (login)', required: true, help: 'Changing it logs the person out; they log in again with the new email.' },
      {
        key: 'role',
        label: 'Role',
        type: 'select',
        required: true,
        options: [
          { value: 'OWNER', label: 'Owner' },
          { value: 'MANAGER', label: 'Manager' },
          { value: 'FRONT_DESK', label: 'Front desk' },
          { value: 'ARTIST', label: 'Artist' },
        ],
      },
      { key: 'phone', label: 'Phone', help: 'Digits only' },
      { key: 'outletIds', label: 'Outlets', type: 'refs', ref: outletRef, full: true, read: (r) => r.outlets?.map((o: any) => o.outletId) ?? [] },
      { key: 'password', label: 'Password', type: 'password', help: 'At least 10 characters. On edit, leave empty to keep it; a new password logs the person out everywhere.', full: true },
      { key: 'pin', label: 'Manager PIN (for voids and discounts)', type: 'pin', editOnly: true, help: '4–8 digits. Leave empty to keep it.' },
      { key: 'isActive', label: 'Active (can log in)', type: 'bool', editOnly: true },
    ],
  },
  artists: {
    title: 'Artists',
    singular: 'artist',
    path: '/admin/artists',
    roles: ['OWNER', 'MANAGER'],
    intro: 'Artists shown on the website and booked in POS. Weekly shifts are set per artist.',
    columns: [
      { label: 'Name', value: (r) => r.displayName },
      { label: 'Role', value: (r) => r.role },
      { label: 'Home outlet', value: (r, l) => l.homeOutletId?.get(r.homeOutletId) ?? '—' },
      { label: 'Commission', value: (r) => `${r.commissionBps / 100}%` },
      { label: 'Payout every', value: (r) => `${r.payoutPeriodDays} days` },
      { label: 'On website', value: (r) => yes(r.isPublic) },
    ],
    fields: [
      { key: 'displayName', label: 'Name', required: true },
      { key: 'slug', label: 'Web address', required: true, help: 'e.g. ayu → /artists/ayu' },
      { key: 'role', label: 'Role / speciality', help: 'e.g. Fine line' },
      { key: 'homeOutletId', label: 'Home outlet', type: 'ref', ref: outletRef },
      { key: 'specialtyIds', label: 'Styles', type: 'refs', ref: styleRef, full: true, read: (r) => r.specialties?.map((s: any) => s.styleId) ?? [] },
      { key: 'commissionBps', label: 'Commission %', type: 'percent', help: 'Maximum 45%' },
      { key: 'payoutPeriodDays', label: 'Payout period (days)', type: 'number', help: 'Starts at the first job after the last payout' },
      { key: 'years', label: 'Years tattooing', type: 'number' },
      { key: 'instagram', label: 'Instagram handle' },
      { key: 'whatsapp', label: 'WhatsApp (internal reminders)', help: 'Digits only' },
      { key: 'userId', label: 'Login (optional)', type: 'ref', ref: { path: '/admin/users', label: (u: any) => `${u.name} (${u.email})` } },
      { key: 'motif', label: 'Placeholder motif' },
      { key: 'photo', label: 'Photo URL' },
      { key: 'bio', label: 'Bio', type: 'textarea', full: true },
      { key: 'sort', label: 'Order', type: 'number' },
      { key: 'isPublic', label: 'Show on website', type: 'bool' },
      { key: 'isActive', label: 'Active', type: 'bool' },
    ],
  },
  styles: {
    title: 'Styles',
    singular: 'style',
    path: '/admin/styles',
    roles: ['OWNER', 'MANAGER'],
    canDelete: true,
    columns: [
      { label: 'Name', value: (r) => r.name },
      { label: 'Address', value: (r) => `/styles/${r.slug}` },
      { label: 'Badge', value: (r) => r.badge },
      { label: 'On website', value: (r) => yes(r.isPublic) },
    ],
    fields: [
      { key: 'name', label: 'Name', required: true },
      { key: 'slug', label: 'Web address', required: true },
      { key: 'badge', label: 'Badge', help: 'e.g. Nusantara' },
      { key: 'motif', label: 'Placeholder motif' },
      { key: 'image', label: 'Image URL' },
      { key: 'sort', label: 'Order', type: 'number' },
      { key: 'description', label: 'Description', type: 'textarea', full: true },
      { key: 'isPublic', label: 'Show on website', type: 'bool' },
    ],
  },
  gallery: {
    title: 'Gallery',
    singular: 'gallery item',
    path: '/admin/gallery',
    roles: ['OWNER', 'MANAGER'],
    canDelete: true,
    columns: [
      { label: 'Code', value: (r) => r.code },
      { label: 'Artist', value: (r, l) => l.artistId?.get(r.artistId) ?? '—' },
      { label: 'Style', value: (r, l) => l.styleId?.get(r.styleId) ?? '—' },
      { label: 'Placement', value: (r) => [r.placement, r.size].filter(Boolean).join(' · ') },
      { label: 'Photo', value: (r) => (r.image ? 'Yes' : 'Placeholder') },
    ],
    fields: [
      { key: 'code', label: 'Code', required: true, help: 'Used in WhatsApp messages, e.g. W-117' },
      { key: 'artistId', label: 'Artist', type: 'ref', ref: artistRef },
      { key: 'styleId', label: 'Style', type: 'ref', ref: styleRef },
      { key: 'outletId', label: 'Outlet', type: 'ref', ref: outletRef },
      { key: 'placement', label: 'Placement', help: 'e.g. Forearm' },
      { key: 'size', label: 'Size', help: 'e.g. 8 cm' },
      { key: 'image', label: 'Photo URL', full: true },
      { key: 'motif', label: 'Placeholder motif' },
      { key: 'sort', label: 'Order', type: 'number' },
      { key: 'caption', label: 'Caption', type: 'textarea', full: true },
      { key: 'isPublic', label: 'Show on website', type: 'bool' },
    ],
  },
  faqs: {
    title: 'FAQs',
    singular: 'question',
    path: '/admin/faqs',
    roles: ['OWNER', 'MANAGER'],
    canDelete: true,
    columns: [
      { label: 'Question', value: (r) => r.question },
      { label: 'On website', value: (r) => yes(r.isPublic) },
    ],
    fields: [
      { key: 'question', label: 'Question', required: true, full: true },
      { key: 'answer', label: 'Answer', type: 'textarea', required: true, full: true },
      { key: 'sort', label: 'Order', type: 'number' },
      { key: 'isPublic', label: 'Show on website', type: 'bool' },
    ],
  },
  reviews: {
    title: 'Reviews',
    singular: 'review',
    path: '/admin/reviews',
    roles: ['OWNER', 'MANAGER'],
    canDelete: true,
    columns: [
      { label: 'Name', value: (r) => r.name },
      { label: 'Review', value: (r) => (r.text.length > 70 ? `${r.text.slice(0, 70)}…` : r.text) },
      { label: 'On website', value: (r) => yes(r.isPublic) },
    ],
    fields: [
      { key: 'name', label: 'Customer name', required: true },
      { key: 'artist', label: 'Artist' },
      { key: 'text', label: 'Review', type: 'textarea', required: true, full: true },
      { key: 'sort', label: 'Order', type: 'number' },
      { key: 'isPublic', label: 'Show on website', type: 'bool' },
    ],
  },
  'payment-methods': {
    title: 'Payment methods',
    singular: 'payment method',
    path: '/admin/payment-methods',
    roles: ['OWNER'],
    intro: 'Methods shown at checkout. The fee % is taken from the Operational share of each transaction.',
    canDelete: true,
    columns: [
      { label: 'Name', value: (r) => r.name },
      { label: 'Type', value: (r) => r.type.toLowerCase() },
      { label: 'Fee', value: (r) => `${r.feeBps / 100}%` },
      { label: 'Needs', value: (r) => [r.requiresCode && 'approval code', r.requiresProof && 'proof photo'].filter(Boolean).join(', ') || '—' },
      { label: 'Active', value: (r) => yes(r.isActive) },
    ],
    fields: [
      { key: 'name', label: 'Name', required: true, help: 'e.g. BCA credit card' },
      {
        key: 'type',
        label: 'Type',
        type: 'select',
        required: true,
        options: [
          { value: 'CARD', label: 'Card (EDC)' },
          { value: 'CASH', label: 'Cash' },
          { value: 'TRANSFER', label: 'Bank transfer' },
          { value: 'QRIS', label: 'QRIS' },
        ],
      },
      { key: 'feeBps', label: 'Fee %', type: 'percent', help: 'e.g. 2 for 2%' },
      { key: 'outletId', label: 'Only at outlet', type: 'ref', ref: outletRef, help: 'Empty = all outlets' },
      { key: 'requiresCode', label: 'Ask for approval code', type: 'bool' },
      { key: 'requiresProof', label: 'Ask for proof photo', type: 'bool' },
      { key: 'sort', label: 'Order', type: 'number' },
      { key: 'isActive', label: 'Active', type: 'bool' },
    ],
  },
};
