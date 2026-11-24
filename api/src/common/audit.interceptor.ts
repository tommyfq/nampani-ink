import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { PrismaService } from '../db/prisma.service';

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Writes an audit log row for every successful change made by a logged-in user. */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger('Audit');

  constructor(private readonly prisma: PrismaService) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = ctx.switchToHttp().getRequest();
    if (SAFE.has(req.method)) return next.handle();

    return next.handle().pipe(
      tap((result: any) => {
        if (!req.user) return;
        const entity = String(req.route?.path ?? req.path).split('/').filter(Boolean)[2] ?? '';
        this.prisma.auditLog
          .create({
            data: {
              userId: req.user.id,
              outletId: req.outletId ?? null,
              action: `${req.method} ${req.originalUrl.split('?')[0]}`,
              entity,
              entityId: String(req.params?.id ?? result?.id ?? ''),
              ip: req.ip ?? '',
            },
          })
          .catch((err) => this.logger.error(`Audit write failed: ${err.message}`));
      }),
    );
  }
}
