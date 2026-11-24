import './load-env';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { mkdirSync } from 'fs';
import { AppModule } from './app.module';
import { UPLOAD_DIR } from './uploads/uploads.service';

// Money is stored as BigInt Rupiah; send it to the browser as a plain number.
(BigInt.prototype as unknown as { toJSON: () => number }).toJSON = function (this: bigint) {
  return Number(this);
};

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // The Next.js server proxies /api and /uploads to this service. Trust only
  // private-network proxies so rate limits use the visitor's real IP.
  app.set('trust proxy', 'loopback, uniquelocal');
  app.disable('x-powered-by');
  app.use(cookieParser());
  app.setGlobalPrefix('api');
  app.enableShutdownHooks();

  // Uploaded reference photos are public (random names), served as images only.
  mkdirSync(UPLOAD_DIR, { recursive: true });
  app.useStaticAssets(UPLOAD_DIR, {
    prefix: '/uploads/',
    index: false,
    dotfiles: 'deny',
    maxAge: '7d',
    setHeaders: (res) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Security-Policy', "default-src 'none'");
    },
  });

  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port, '0.0.0.0');
  Logger.log(`API listening on :${port}`, 'Bootstrap');
}
bootstrap();
