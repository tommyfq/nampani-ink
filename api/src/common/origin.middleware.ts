import { ForbiddenException, Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF protection for cookie-authenticated routes: a browser request that changes
 * data must come from one of our own apps (APP_ORIGINS). Requests without an Origin
 * header (server-to-server, scripts) are allowed; browsers always send it on POST.
 */
@Injectable()
export class OriginMiddleware implements NestMiddleware {
  private readonly allowed = new Set(
    (process.env.APP_ORIGINS ?? '')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean),
  );

  use(req: Request, _res: Response, next: NextFunction) {
    const origin = req.headers.origin;
    if (!SAFE.has(req.method) && origin && !this.allowed.has(origin)) {
      throw new ForbiddenException('Request from an unknown site');
    }
    next();
  }
}
