import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { Role } from '@prisma/client';

export const ROLES_KEY = 'roles';
/** Roles allowed on a controller or route (OWNER is always allowed). */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  outletIds: string[];
}

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): SessionUser => ctx.switchToHttp().getRequest().user,
);
