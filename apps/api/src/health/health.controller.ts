import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';
import { ApiTags } from '@nestjs/swagger';
import { PrismaHealthIndicator } from './prisma.health';
import { RedisHealthIndicator } from './redis.health';

@ApiTags('health')
@Controller()
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly prisma: PrismaHealthIndicator,
    private readonly redis: RedisHealthIndicator,
  ) {}

  /** Liveness — is the process up? No dependency checks (§40). */
  @Get('health')
  live() {
    return { status: 'ok', uptime: process.uptime() };
  }

  /** Readiness — can we serve traffic? Checks DB + Redis (§40). */
  @Get('health/ready')
  @HealthCheck()
  ready() {
    return this.health.check([
      () => this.prisma.isHealthy('database'),
      () => this.redis.isHealthy('redis'),
    ]);
  }
}
