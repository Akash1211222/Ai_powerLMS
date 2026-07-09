/**
 * HTTP end-to-end test (§41) booting the full Nest app with supertest against a
 * real Postgres (seeded). Verifies the auth + authorization stack over HTTP:
 *   - seeded super admin can log in and read audit logs (audit:view)
 *   - seeded student is authenticated but FORBIDDEN from audit logs
 *   - unauthenticated access is rejected
 *
 * Runs only when TEST_DATABASE_URL is set (CI provides it). Requires the DB to
 * be migrated and seeded first (`pnpm db:migrate:deploy && pnpm db:seed`).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

const TEST_DB = process.env.TEST_DATABASE_URL;
const run = TEST_DB ? describe : describe.skip;

run('Auth + Authorization (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB;
    // Deferred imports: loading AppModule eagerly runs env validation, so keep
    // it inside the guarded suite (skipped when no infra is configured).
    const { AppModule } = await import('../src/app.module');
    const { AllExceptionsFilter } = await import('../src/common/filters/all-exceptions.filter');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1', { exclude: ['health', 'health/ready'] });
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  async function login(email: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: 'Password123!' })
      .expect(200);
    return res.body.accessToken as string;
  }

  it('rejects unauthenticated access to a protected route', async () => {
    await request(app.getHttpServer()).get('/api/v1/admin/audit-logs').expect(401);
  });

  it('allows super admin (audit:view) to read audit logs', async () => {
    const token = await login('superadmin@futurecorpacademy.in');
    const res = await request(app.getHttpServer())
      .get('/api/v1/admin/audit-logs')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('meta.total');
  });

  it('forbids a student from reading audit logs', async () => {
    const token = await login('student@futurecorpacademy.in');
    const res = await request(app.getHttpServer())
      .get('/api/v1/admin/audit-logs')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('returns the current user with resolved permissions at /auth/me', async () => {
    const token = await login('trainer@futurecorpacademy.in');
    const res = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.email).toBe('trainer@futurecorpacademy.in');
    expect(Array.isArray(res.body.permissions)).toBe(true);
    expect(res.body.permissions).toContain('attendance:mark');
  });
});
