import type { Artist, Branch, Style, Work } from './types';

/** wa.me link with a pre-filled message. `number` is digits only, e.g. 6281234567890. */
export function waLink(number: string, text: string) {
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}

export function designMessage(studioName: string, work: Work, style?: Style, artist?: Artist, branch?: Branch, origin?: string) {
  const lines = [
    `Hi ${studioName}! I'd like to book this design:`,
    '',
    `*Design:* ${work.id}${style ? ` — ${style.name}` : ''}`,
  ];
  if (artist) lines.push(`*Artist:* ${artist.name}${branch ? ` (${branch.name})` : ''}`);
  lines.push(`*Original size:* ${work.size}, ${work.placement}`);
  if (work.image && origin) lines.push(`*Image:* ${new URL(work.image, origin).href}`);
  lines.push('', 'My placement & size: ');
  return lines.join('\n');
}
