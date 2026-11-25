import { Controller, Get, Module, ServiceUnavailableException } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { PrismaService } from '../db/prisma.service';
import { RedisService } from '../db/redis.service';

const within = <T>(p: Promise<T>, ms: number) =>
  Promise.race([p, new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))]);

/** Used by the uptime monitor: checks the database and Redis, answers 503 when one is down. */
@Controller('health')
@SkipThrottle()
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Get('full')
  async full() {
    const [db, redis] = await Promise.all([
      within(this.prisma.$queryRaw`SELECT 1`, 3000).then(() => 'ok', () => 'down'),
      within(this.redis.ping(), 3000).then(() => 'ok', () => 'down'),
    ]);
    const result = { status: db === 'ok' && redis === 'ok' ? 'ok' : 'down', database: db, redis };
    if (result.status !== 'ok') throw new ServiceUnavailableException(result);
    return result;
  }
}

@Module({ controllers: [HealthController] })
export class HealthModule {}
