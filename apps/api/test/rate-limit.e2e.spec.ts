/**
 * Rate limiting e2e (§39). Runs live in CI. This spec is the one place the
 * limiter is switched on (the rest of the suite disables it), with tiny
 * budgets so the 429 boundary is reachable.
 *
 * Each test uses a distinct client IP via X-Forwarded-For with `trust proxy`
 * enabled — the same path used in production behind a load balancer. That also
 * keeps every test's bucket independent, since throttler storage is in-memory
 * and shared for the lifetime of the process.
 *
 * Verifies:
 *   - unauthenticated auth routes get the tight budget and then 429
 *   - buckets are per-IP, so one abusive client can't lock out everyone else
 *   - the general budget is separate from the auth budget
 *   - health probes are never throttled.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

const TEST_DB = process.env.TEST_DATABASE_URL;
const run = TEST_DB ? describe : describe.skip;

const AUTH_MAX = 3;
const GENERAL_MAX = 20;

run('Rate limiting (e2e)', () => {
  let app: NestExpressApplication;
  let ipSeed = 0;
  /** A fresh client IP per test, so buckets never bleed between them. */
  const nextIp = () => `203.0.113.${++ipSeed}`;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB;
    // Enable the limiter for this spec only, with reachable budgets.
    process.env.RATE_LIMIT_ENABLED = 'true';
    process.env.RATE_LIMIT_TTL_SECONDS = '60';
    process.env.RATE_LIMIT_MAX = String(GENERAL_MAX);
    process.env.AUTH_RATE_LIMIT_MAX = String(AUTH_MAX);

    const { AppModule } = await import('../src/app.module');
    const { AllExceptionsFilter } = await import('../src/common/filters/all-exceptions.filter');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    app.setGlobalPrefix('api/v1', { exclude: ['health', 'health/ready'] });
    app.useGlobalFilters(new AllExceptionsFilter());
    // Mirrors bootstrap: resolve the client IP from the proxy header.
    app.set('trust proxy', 1);
    await app.init();
  });

  afterAll(async () => {
    process.env.RATE_LIMIT_ENABLED = 'false';
    if (app) await app.close();
  });

  /**
   * A unique email per caller. The per-account login lockout also answers 429,
   * so reusing one address would make this spec measure the wrong mechanism.
   */
  const badLogin = (ip: string, email: string) =>
    request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('X-Forwarded-For', ip)
      .send({ email, password: 'WrongPassword123!' });

  let emailSeed = 0;
  const nextEmail = () => `throttle-${Date.now()}-${++emailSeed}@futurecorpacademy.in`;

  /** True when a 429 came from the rate limiter rather than the account lockout. */
  const isThrottled = (res: { status: number; body: { error?: { message?: string } } }) =>
    res.status === 429 && !(res.body.error?.message ?? '').includes('failed login attempts');

  it('throttles unauthenticated auth routes at the tight budget', async () => {
    const ip = nextIp();
    const email = nextEmail();
    const responses = [];
    for (let i = 0; i < AUTH_MAX + 2; i++) responses.push(await badLogin(ip, email));

    // The budget is spent on real attempts (401 for bad credentials), then the
    // limiter — not the account lockout — starts refusing.
    expect(responses.slice(0, AUTH_MAX).every((r) => r.status === 401)).toBe(true);
    expect(responses.slice(AUTH_MAX).every(isThrottled)).toBe(true);
  });

  it('keeps buckets per-IP so one abusive client cannot lock out others', async () => {
    const abusive = nextIp();
    for (let i = 0; i < AUTH_MAX; i++) await badLogin(abusive, nextEmail());
    expect(isThrottled(await badLogin(abusive, nextEmail()))).toBe(true);

    // A different client is unaffected.
    expect((await badLogin(nextIp(), nextEmail())).status).toBe(401);
  });

  it('never throttles health probes', async () => {
    const ip = nextIp();
    for (let i = 0; i < GENERAL_MAX + 5; i++) {
      await request(app.getHttpServer()).get('/health').set('X-Forwarded-For', ip).expect(200);
    }
  });

  it('keeps the general budget separate from an exhausted auth budget', async () => {
    const ip = nextIp();
    for (let i = 0; i < AUTH_MAX; i++) await badLogin(ip, nextEmail());
    expect(isThrottled(await badLogin(ip, nextEmail()))).toBe(true);

    // Same client, non-auth route: still served (401 unauthenticated, not 429).
    const res = await request(app.getHttpServer()).get('/api/v1/me/reputation').set('X-Forwarded-For', ip);
    expect(res.status).not.toBe(429);
  });
});
