import {
  BadRequestException,
  Controller,
  Post,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { memoryStorage } from 'multer';
import { UploadsService } from './uploads.service';

export const MAX_FILES = 3;
export const MAX_BYTES = 10 * 1024 * 1024; // 10 MB per photo

/**
 * Customers upload reference photos from the booking form. The API stores them
 * and returns public links, which the website puts into the WhatsApp message
 * (a wa.me link can carry text only, not attachments).
 */
@Controller('uploads')
export class UploadsController {
  constructor(private readonly uploads: UploadsService) {}

  @Post()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UseInterceptors(
    FilesInterceptor('files', MAX_FILES, {
      storage: memoryStorage(),
      limits: { fileSize: MAX_BYTES, files: MAX_FILES },
    }),
  )
  async upload(@UploadedFiles() files: Express.Multer.File[] = []) {
    if (!files.length) throw new BadRequestException('Add at least one photo.');
    const saved = await this.uploads.saveReferences(files);
    return { files: saved };
  }
}
