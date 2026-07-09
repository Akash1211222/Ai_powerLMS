/**
 * Dashboard aggregation e2e (§8, §9). Runs live in CI. Verifies both dashboards
 * return a well-formed, real (possibly empty) payload and are auth-protected.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

const TEST_DB = process.env.TEST_DATABASE_URL;
const run = TEST_DB ? describe : describe.skip;

run('Dashboards (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB;
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

  it('rejects unauthenticated dashboard access (401)', async () => {
    await request(app.getHttpServer()).get('/api/v1/dashboard/student').expect(401);
  });

  it('returns a well-formed student dashboard', async () => {
    const token = await login('student@futurecorpacademy.in');
    const res = await request(app.getHttpServer())
      .get('/api/v1/dashboard/student')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.stats).toHaveProperty('activeCourses');
    expect(res.body.stats).toHaveProperty('avgProgress');
    expect(Array.isArray(res.body.enrollments)).toBe(true);
    expect(Array.isArray(res.body.upcomingSessions)).toBe(true);
  });

  it('returns a well-formed trainer dashboard', async () => {
    const token = await login('trainer@futurecorpacademy.in');
    const res = await request(app.getHttpServer())
      .get('/api/v1/dashboard/trainer')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.stats).toHaveProperty('totalBatches');
    expect(res.body.stats).toHaveProperty('totalStudents');
    expect(Array.isArray(res.body.batches)).toBe(true);
  });
});
