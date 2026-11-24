import { Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { SessionUser } from '../common/auth.decorators';
import { PrismaService } from '../db/prisma.service';
import { RedisService } from '../db/redis.service';
import { verifySecret } from './password';

export const SESSION_COOKIE = 'npi_sid';
const SESSION_TTL_SECONDS = 12 * 60 * 60; // sliding: renewed on every request
const LOCK_AFTER_FAILURES = 5;
const LOCK_SECONDS = 15 * 60;

// A real hash so unknown emails take as long as wrong passwords.
const DUMMY_HASH =
  'scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==';

const sessionKey = (token: string) => `sess:${createHash('sha256').update(token).digest('hex')}`;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /** Checks email + password and returns a new session token (stored hashed in Redis). */
  async login(emailRaw: string, password: string): Promise<{ token: string; user: SessionUser }> {
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
    const token = randomBytes(32).toString('base64url');
    await this.redis.set(sessionKey(token), user.id, 'EX', SESSION_TTL_SECONDS);
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    return { token, user: (await this.loadUser(user.id))! };
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

  /** Ends every session of a user (after a password change or deactivation). */
  async revokeAll(userId: string) {
    const stream = this.redis.scanStream({ match: 'sess:*', count: 200 });
    for await (const keys of stream as AsyncIterable<string[]>) {
      for (const key of keys) {
        if ((await this.redis.get(key)) === userId) await this.redis.del(key);
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
