import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import { join, resolve } from 'path';

export const UPLOAD_DIR = resolve(process.env.UPLOAD_DIR ?? 'uploads');

type Kind = { ext: string; mime: string };

/** Detect the real image type from the file's first bytes (not the browser-supplied type). */
function sniff(buf: Buffer): Kind | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { ext: 'jpg', mime: 'image/jpeg' };
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
    return { ext: 'png', mime: 'image/png' };
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP')
    return { ext: 'webp', mime: 'image/webp' };
  if (buf.toString('ascii', 0, 4) === 'GIF8') return { ext: 'gif', mime: 'image/gif' };
  if (buf.toString('ascii', 4, 8) === 'ftyp') {
    const brand = buf.toString('ascii', 8, 12);
    if (['heic', 'heix', 'mif1', 'msf1'].includes(brand)) return { ext: 'heic', mime: 'image/heic' };
  }
  return null;
}

@Injectable()
export class UploadsService {
  async saveReferences(files: Express.Multer.File[]) {
    const kinds = files.map((f) => {
      const kind = sniff(f.buffer);
      if (!kind) throw new BadRequestException(`${f.originalname} is not a JPG, PNG, WEBP, GIF or HEIC image.`);
      return kind;
    });

    const dir = join(UPLOAD_DIR, 'references');
    await mkdir(dir, { recursive: true });

    return Promise.all(
      files.map(async (f, i) => {
        // Random, unguessable file name; the original name is never used on disk.
        const name = `${randomUUID()}.${kinds[i].ext}`;
        await writeFile(join(dir, name), f.buffer, { flag: 'wx' });
        return { path: `/uploads/references/${name}`, mime: kinds[i].mime, size: f.size };
      }),
    );
  }
}
