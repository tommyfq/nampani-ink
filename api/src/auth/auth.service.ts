import { HttpException, HttpStatus, Injectable, Logger, OnModuleInit, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { createHash, randomBytes, randomInt, timingSafeEqual } from 'crypto';
import { MailService } from '../mail/mail.service';
import { SessionUser } from '../common/auth.decorators';
import { PrismaService } from '../db/prisma.service';
import { RedisService } from '../db/redis.service';
import { verifySecret } from './password';

export const SESSION_COOKIE = 'npi_sid';
export const DEVICE_COOKIE = 'npi_dev';
export const TRUST_DAYS = 30;
const SESSION_TTL_SECONDS = 12 * 60 * 60; // sliding: renewed on every request
const LOCK_AFTER_FAILURES = 5;
const LOCK_SECONDS = 15 * 60;

// A real hash so unknown emails take as long as wrong passwords.
const DUMMY_HASH =
  'scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==';

const sha = (v: string) => createHash('sha256').update(v).digest('hex');
const sessionKey = (token: string) => `sess:${sha(token)}`;
const trustKey = (token: string) => `trust:${sha(token)}`;
const otpKey = (challenge: string) => `otp:${sha(challenge)}`;

// Email login codes (see .env.example: LOGIN_OTP).
const OTP_TTL_SECONDS = 10 * 60;
const OTP_MAX_TRIES = 5;
const OTP_RESEND_AFTER_MS = 60_000;
const OTP_MAX_PER_HOUR = 5;

interface Challenge {
  userId: string;
  codeHash: string;
  tries: number;
  sentAt: number;
}

export interface LoginContext {
  ip: string;
  userAgent: string;
  deviceToken?: string;
}

export type LoginResult =
  | { step: 'done'; token: string; user: SessionUser; trustToken?: string }
  | { step: 'code'; challenge: string; sentTo: string };

/** "t•••y@nampani.ink" */
function maskEmail(email: string) {
  const [name, domain] = email.split('@');
  return `${name[0]}${'•'.repeat(Math.max(1, Math.min(4, name.length - 2)))}${name.length > 1 ? name.at(-1) : ''}@${domain}`;
}

/** A short, readable device name for the email ("Chrome on Mac"). */
function deviceName(ua: string) {
  const browser = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'A browser';
  const os = /iPhone|iPad/.test(ua) ? 'iPhone/iPad' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : '';
  return os ? `${browser} on ${os}` : browser;
}

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly mail: MailService,
  ) {}

  /** Login codes are on when LOGIN_OTP=true and email can actually be sent. */
  get otpEnabled() {
    return process.env.LOGIN_OTP === 'true' && this.mail.mode !== 'off';
  }

  onModuleInit() {
    if (process.env.LOGIN_OTP === 'true' && this.mail.mode === 'off') {
      this.logger.warn('LOGIN_OTP=true but SMTP is not set: login codes are OFF until SMTP_HOST is set');
    } else {
      this.logger.log(`Email login codes: ${this.otpEnabled ? 'ON' : 'OFF'}`);
    }
  }

  /**
   * Step 1: email + password. Returns a session right away when login codes are off or
   * this device is trusted; otherwise emails a 6-digit code and returns a challenge id.
   */
  async login(emailRaw: string, password: string, ctx: LoginContext): Promise<LoginResult> {
    const user = await this.checkPassword(emailRaw, password);
    if (!this.otpEnabled) return this.finish(user.id, ctx, 'password');
    if (ctx.deviceToken && (await this.redis.get(trustKey(ctx.deviceToken))) === user.id) {
      return this.finish(user.id, ctx, 'trusted device');
    }
    const challenge = randomBytes(24).toString('base64url');
    await this.sendCode(challenge, user, ctx, null);
    return { step: 'code', challenge, sentTo: maskEmail(user.email) };
  }

  /** Step 2: the code from the email. */
  async verifyCode(challenge: string, code: string, trust: boolean, ctx: LoginContext): Promise<LoginResult> {
    const key = otpKey(challenge);
    const raw = await this.redis.get(key);
    if (!raw) throw new UnauthorizedException('This code has expired. Log in again to get a new one.');
    const c = JSON.parse(raw) as Challenge;
    const ok = timingSafeEqual(Buffer.from(sha(`${challenge}:${code}`)), Buffer.from(c.codeHash));
    if (!ok) {
      c.tries += 1;
      await this.audit(c.userId, 'LOGIN CODE WRONG', ctx);
      if (c.tries >= OTP_MAX_TRIES) {
        await this.redis.del(key);
        throw new UnauthorizedException('Too many wrong codes. Log in again to get a new one.');
      }
      await this.redis.set(key, JSON.stringify(c), 'KEEPTTL');
      const left = OTP_MAX_TRIES - c.tries;
      throw new UnauthorizedException(`Wrong code. ${left} ${left === 1 ? 'try' : 'tries'} left.`);
    }
    await this.redis.del(key);
    const user = await this.loadUser(c.userId);
    if (!user) throw new UnauthorizedException('This account is not active');
    const result = await this.finish(user.id, ctx, trust ? 'code, trusted this device' : 'code');
    if (trust && result.step === 'done') {
      const trustToken = randomBytes(32).toString('base64url');
      await this.redis.set(trustKey(trustToken), user.id, 'EX', TRUST_DAYS * 86400);
      result.trustToken = trustToken;
    }
    return result;
  }

  /** Sends a new code for the same login attempt. */
  async resendCode(challenge: string, ctx: LoginContext) {
    const raw = await this.redis.get(otpKey(challenge));
    if (!raw) throw new UnauthorizedException('This login has expired. Log in again.');
    const c = JSON.parse(raw) as Challenge;
    const wait = Math.ceil((c.sentAt + OTP_RESEND_AFTER_MS - Date.now()) / 1000);
    if (wait > 0) throw new HttpException(`Wait ${wait} seconds before asking for a new code.`, HttpStatus.TOO_MANY_REQUESTS);
    const user = await this.prisma.user.findUnique({ where: { id: c.userId } });
    if (!user || !user.isActive) throw new UnauthorizedException('This account is not active');
    await this.sendCode(challenge, user, ctx, c);
    return { sentTo: maskEmail(user.email) };
  }

  private async sendCode(challenge: string, user: { id: string; email: string; name: string }, ctx: LoginContext, prev: Challenge | null) {
    const hourKey = `otp-sent:${user.id}`;
    const sent = Number((await this.redis.get(hourKey)) ?? 0);
    if (sent >= OTP_MAX_PER_HOUR) {
      throw new HttpException('Too many login codes were sent. Try again in an hour.', HttpStatus.TOO_MANY_REQUESTS);
    }
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const c: Challenge = { userId: user.id, codeHash: sha(`${challenge}:${code}`), tries: prev?.tries ?? 0, sentAt: Date.now() };
    await this.redis.set(otpKey(challenge), JSON.stringify(c), 'EX', OTP_TTL_SECONDS);
    await this.redis.multi().incr(hourKey).expire(hourKey, 3600, 'NX').exec();
    const log = await this.mail.loginCode(user.email, user.name, code, { device: deviceName(ctx.userAgent), ip: ctx.ip });
    if (log?.status !== 'SENT') {
      await this.redis.del(otpKey(challenge));
      this.logger.error(`Login code email to user ${user.id} failed: ${log?.error ?? 'unknown'}`);
      throw new ServiceUnavailableException('We could not send the login code email. Try again in a minute, or ask the owner.');
    }
    await this.audit(user.id, prev ? 'LOGIN CODE RESENT' : 'LOGIN CODE SENT', ctx);
  }

  private async checkPassword(emailRaw: string, password: string) {
    const email = emailRaw.trim().toLowerCase();
    const lockKey = `login-fail:${email}`;
    const failures = Number((await this.redis.get(lockKey)) ?? 0);
    if (failures >= LOCK_AFTER_FAILURES) {
      throw new UnauthorizedException('Too many failed attempts. Try again in 15 minutes.');
    }

    const user = await this.prisma.user.findUnique({ where: { email } });
    const ok = await verifySecret(password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !ok || !user.isActive) {
      await this.redis.multi().incr(lockKey).expire(lockKey, LOCK_SECONDS).exec();
      throw new UnauthorizedException('Wrong email or password');
    }

    await this.redis.del(lockKey);
    return user;
  }

  /** Creates the session after every check has passed. */
  private async finish(userId: string, ctx: LoginContext, how: string): Promise<LoginResult> {
    const user = await this.loadUser(userId);
    if (!user) throw new UnauthorizedException('This account is not active');
    const token = randomBytes(32).toString('base64url');
    await this.redis.set(sessionKey(token), user.id, 'EX', SESSION_TTL_SECONDS);
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await this.audit(user.id, 'LOGIN', ctx, { method: how });
    return { step: 'done', token, user };
  }

  private async audit(userId: string, action: string, ctx: LoginContext, detail?: Record<string, string>) {
    await this.prisma.auditLog
      .create({ data: { userId, action, entity: 'login', ip: ctx.ip, detail: { device: deviceName(ctx.userAgent), ...detail } } })
      .catch((err) => this.logger.error(`Audit write failed: ${err.message}`));
  }

  async logout(token: string | undefined) {
    if (token) await this.redis.del(sessionKey(token));
  }

  /** Resolves a session token to an active user, renewing the session. */
  async fromToken(token: string | undefined): Promise<SessionUser | null> {
    if (!token) return null;
    const key = sessionKey(token);
    const userId = await this.redis.get(key);
    if (!userId) return null;
    const user = await this.loadUser(userId);
    if (!user) {
      await this.redis.del(key);
      return null;
    }
    await this.redis.expire(key, SESSION_TTL_SECONDS);
    return user;
  }

  /** Ends every session of a user and forgets their trusted devices (after a password change or deactivation). */
  async revokeAll(userId: string) {
    for (const match of ['sess:*', 'trust:*']) {
      const stream = this.redis.scanStream({ match, count: 200 });
      for await (const keys of stream as AsyncIterable<string[]>) {
        for (const key of keys) {
          if ((await this.redis.get(key)) === userId) await this.redis.del(key);
        }
      }
    }
  }

  private async loadUser(id: string): Promise<SessionUser | null> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { outlets: { select: { outletId: true } } },
    });
    if (!user || !user.isActive) return null;
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      outletIds: user.outlets.map((o) => o.outletId),
    };
  }
}
