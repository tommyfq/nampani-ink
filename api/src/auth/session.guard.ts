import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { ROLES_KEY } from '../common/auth.decorators';
import { AuthService, SESSION_COOKIE } from './auth.service';

/**
 * Requires a logged-in user (session cookie) and, when @Roles is set, one of those roles.
 * OWNER passes every role check.
 * If the request names an outlet (X-Outlet-Id header), non-owners must be assigned to it.
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly auth: AuthService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const user = await this.auth.fromToken(req.cookies?.[SESSION_COOKIE]);
    if (!user) throw new UnauthorizedException('Please log in');
    req.user = user;

    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [ctx.getHandler(), ctx.getClass()]);
    if (roles?.length && user.role !== 'OWNER' && !roles.includes(user.role)) {
      throw new ForbiddenException('You do not have access to this');
    }

    const outletId = req.headers['x-outlet-id'];
    if (typeof outletId === 'string' && outletId && user.role !== 'OWNER' && !user.outletIds.includes(outletId)) {
      throw new ForbiddenException('You do not have access to this outlet');
    }
    req.outletId = typeof outletId === 'string' && outletId ? outletId : undefined;
    return true;
  }
}
