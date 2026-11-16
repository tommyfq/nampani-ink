import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { readFileSync, statSync } from 'fs';
import { resolve } from 'path';
import { SiteContent, Work } from './content.types';

/**
 * Serves the studio content from a JSON file (no database).
 * The file is re-read automatically when it changes on disk, so content can be
 * edited (or mounted as a Docker volume) without restarting the API.
 */
@Injectable()
export class ContentService {
  private readonly logger = new Logger(ContentService.name);
  private readonly file = resolve(process.env.CONTENT_FILE ?? 'content/studio.json');
  private cache: SiteContent | null = null;
  private mtime = 0;

  get(): SiteContent {
    const { mtimeMs } = statSync(this.file);
    if (!this.cache || mtimeMs !== this.mtime) {
      const raw = JSON.parse(readFileSync(this.file, 'utf8'));
      delete raw._note;
      this.cache = raw as SiteContent;
      this.mtime = mtimeMs;
      this.logger.log(`Loaded content from ${this.file}`);
    }
    return this.cache;
  }

  branch(id: string) {
    const branch = this.get().branches.find((b) => b.id === id);
    if (!branch) throw new NotFoundException(`Studio "${id}" not found`);
    const c = this.get();
    return {
      ...branch,
      artists: c.artists.filter((a) => a.branch === id),
      gallery: c.gallery.filter((w) => c.artists.find((a) => a.id === w.artist)?.branch === id),
    };
  }

  style(id: string) {
    const style = this.get().styles.find((s) => s.id === id);
    if (!style) throw new NotFoundException(`Style "${id}" not found`);
    const c = this.get();
    return {
      ...style,
      gallery: c.gallery.filter((w) => w.style === id),
      artists: c.artists.filter((a) => a.specialties.includes(id)),
    };
  }

  artist(id: string) {
    const artist = this.get().artists.find((a) => a.id === id);
    if (!artist) throw new NotFoundException(`Artist "${id}" not found`);
    return { ...artist, gallery: this.get().gallery.filter((w) => w.artist === id) };
  }

  gallery(filter: { style?: string; artist?: string; branch?: string }): Work[] {
    const c = this.get();
    return c.gallery.filter(
      (w) =>
        (!filter.style || w.style === filter.style) &&
        (!filter.artist || w.artist === filter.artist) &&
        (!filter.branch || c.artists.find((a) => a.id === w.artist)?.branch === filter.branch),
    );
  }
}
