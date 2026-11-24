import { Body, Controller, Get, HttpCode, Post, Req, Res, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { CurrentUser, SessionUser } from '../common/auth.decorators';
import { ZodPipe } from '../common/zod.pipe';
import { AuthService, DEVICE_COOKIE, LoginContext, LoginResult, SESSION_COOKIE, TRUST_DAYS } from './auth.service';
import { SessionGuard } from './session.guard';

const LoginBody = z.object({
  email: z.string().email().max(200),
  password: z.string().min(1).max(200),
});

const CodeBody = z.object({
  challenge: z.string().min(10).max(100),
  code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code'),
  trust: z.boolean().default(false),
});
const ResendBody = z.object({ challenge: z.string().min(10).max(100) });

const context = (req: Request): LoginContext => ({
  ip: req.ip ?? '',
  userAgent: String(req.headers['user-agent'] ?? '').slice(0, 300),
  deviceToken: req.cookies?.[DEVICE_COOKIE],
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
  async login(@Body(new ZodPipe(LoginBody)) body: z.infer<typeof LoginBody>, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.respond(await this.auth.login(body.email, body.password, context(req)), res);
  }

  /** Step 2 when login codes are on: the 6-digit code from the email. */
  @Post('login/code')
  @HttpCode(200)
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  async code(@Body(new ZodPipe(CodeBody)) body: z.infer<typeof CodeBody>, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.respond(await this.auth.verifyCode(body.challenge, body.code, body.trust, context(req)), res);
  }

  @Post('login/resend')
  @HttpCode(200)
  @Throttle({ default: { ttl: 60_000, limit: 3 } })
  resend(@Body(new ZodPipe(ResendBody)) body: z.infer<typeof ResendBody>, @Req() req: Request) {
    return this.auth.resendCode(body.challenge, context(req));
  }

  private respond(result: LoginResult, res: Response) {
    if (result.step === 'code') return { step: 'code', challenge: result.challenge, sentTo: result.sentTo };
    res.cookie(SESSION_COOKIE, result.token, cookieOptions());
    if (result.trustToken) res.cookie(DEVICE_COOKIE, result.trustToken, { ...cookieOptions(), maxAge: TRUST_DAYS * 864e5 });
    return { step: 'done', user: result.user };
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
