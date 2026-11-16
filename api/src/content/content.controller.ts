import { Controller, Get, Param, Query } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { ContentService } from './content.service';

// Read-only content is requested by the Next.js server on behalf of every
// visitor, so it is not rate-limited (all requests share the web server's IP).
@SkipThrottle()
@Controller()
export class ContentController {
  constructor(private readonly content: ContentService) {}

  /** Everything the home page needs, in one request. */
  @Get('site')
  site() {
    return this.content.get();
  }

  @Get('studios')
  studios() {
    return this.content.get().branches;
  }

  @Get('studios/:id')
  studio(@Param('id') id: string) {
    return this.content.branch(id);
  }

  @Get('styles')
  styles() {
    return this.content.get().styles;
  }

  @Get('styles/:id')
  style(@Param('id') id: string) {
    return this.content.style(id);
  }

  @Get('artists')
  artists() {
    return this.content.get().artists;
  }

  @Get('artists/:id')
  artist(@Param('id') id: string) {
    return this.content.artist(id);
  }

  @Get('gallery')
  gallery(@Query('style') style?: string, @Query('artist') artist?: string, @Query('studio') branch?: string) {
    return this.content.gallery({ style, artist, branch });
  }

  @Get('health')
  health() {
    return { status: 'ok' };
  }
}
