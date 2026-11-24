import { Body, Controller, Get, HttpCode, Post, Req, Res, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { CurrentUser, SessionUser } from '../common/auth.decorators';
import { ZodPipe } from '../common/zod.pipe';
import { AuthService, SESSION_COOKIE } from './auth.service';
import { SessionGuard } from './session.guard';

const LoginBody = z.object({
  email: z.string().email().max(200),
  password: z.string().min(1).max(200),
});

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.COOKIE_SECURE === 'true',
    domain: process.env.COOKIE_DOMAIN || undefined,
    path: '/',
    maxAge: 12 * 60 * 60 * 1000,
  };
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  @HttpCode(200)
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  async login(@Body(new ZodPipe(LoginBody)) body: z.infer<typeof LoginBody>, @Res({ passthrough: true }) res: Response) {
    const { token, user } = await this.auth.login(body.email, body.password);
    res.cookie(SESSION_COOKIE, token, cookieOptions());
    return { user };
  }

  @Post('logout')
  @HttpCode(200)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(req.cookies?.[SESSION_COOKIE]);
    const { maxAge: _maxAge, ...opts } = cookieOptions();
    res.clearCookie(SESSION_COOKIE, opts);
    return { ok: true };
  }

  @Get('me')
  @UseGuards(SessionGuard)
  me(@CurrentUser() user: SessionUser) {
    return { user };
  }
}
