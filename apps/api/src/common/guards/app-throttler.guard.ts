import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModuleOptions, ThrottlerStorage } from '@nestjs/throttler';
import type { ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { Env } from '../../config/env';

/**
 * Per-IP HTTP rate limiting (§39). Complements the per-account login lockout:
 * that stops password guessing against one user, this bounds email spraying,
 * scraping and hammering of expensive endpoints.
 *
 * Health probes are never throttled — a load balancer must always be able to
 * ask whether the process is alive.
 */
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  private readonly enabled: boolean;

  constructor(
    options: ThrottlerModuleOptions,
    storageService: ThrottlerStorage,
    reflector: Reflector,
    config: ConfigService<Env, true>,
  ) {
    super(options, storageService, reflector);
    this.enabled = config.get('RATE_LIMIT_ENABLED', { infer: true });
  }

  protected override async shouldSkip(context: ExecutionContext): Promise<boolean> {
    if (!this.enabled) return true;
    if (context.getType() !== 'http') return true;
    const path = context.switchToHttp().getRequest<Request>().path ?? '';
    return path === '/health' || path === '/health/ready';
  }

  /**
   * Key on the real client IP. `trust proxy` is enabled in bootstrap, so
   * Express resolves this from X-Forwarded-For behind a load balancer.
   */
  protected override async getTracker(req: Request): Promise<string> {
    return req.ip ?? 'unknown';
  }
}
