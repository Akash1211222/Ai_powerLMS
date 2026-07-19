/**
 * Weekly progress report e2e (§21). Runs live in CI. Verifies:
 *   - a student can generate their own weekly report (heuristic, schema-shaped)
 *   - metrics are computed by the platform and echoed back
 *   - generation is idempotent per (student, week) — a second call skips
 *   - staff can list + generate a report for a student; students cannot reach
 *     the staff-scoped endpoints, and can only read their own reports.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaClient } from '@fca/database';

const TEST_DB = process.env.TEST_DATABASE_URL;
const run = TEST_DB ? describe : describe.skip;

run('Weekly progress reports (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let studentId: string;
  let adminToken: string;
  let studentToken: string;
  let reportId = '';

  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB;
    prisma = new PrismaClient({ datasourceUrl: TEST_DB });
    studentId = (await prisma.user.findUniqueOrThrow({ where: { email: 'student@futurecorpacademy.in' } })).id;

    const { AppModule } = await import('../src/app.module');
    const { AllExceptionsFilter } = await import('../src/common/filters/all-exceptions.filter');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1', { exclude: ['health', 'health/ready'] });
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();

    adminToken = await login('superadmin@futurecorpacademy.in');
    studentToken = await login('student@futurecorpacademy.in');

    // Deterministic baseline: no report for this week yet.
    await prisma.weeklyProgressReport.deleteMany({ where: { userId: studentId } });
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.weeklyProgressReport.deleteMany({ where: { userId: studentId } }).catch(() => undefined);
      await prisma.$disconnect();
    }
    if (app) await app.close();
  });

  async function login(email: string): Promise<string> {
    const res = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email, password: 'Password123!' }).expect(200);
    return res.body.accessToken as string;
  }
  async function api(method: 'post' | 'get', path: string, token: string, body?: unknown) {
    const r = request(app.getHttpServer())[method](path).set(auth(token));
    const res = await (body ? r.send(body) : r);
    if (res.status >= 400) throw new Error(`${method} ${path} -> ${res.status}: ${res.text}`);
    return res.body;
  }

  it('lets a student generate their own weekly report with computed metrics', async () => {
    const result = await api('post', '/api/v1/me/reports/generate', studentToken);
    expect(result.skipped).toBe(false);
    expect(result.reportId).toBeTruthy();
    reportId = result.reportId;

    const report = await api('get', `/api/v1/me/reports/${reportId}`, studentToken);
    expect(report.summary.length).toBeGreaterThan(10);
    expect(report.provider).toBe('heuristic');
    expect(Array.isArray(report.nextWeekGoals)).toBe(true);
    expect(report.nextWeekGoals.length).toBeGreaterThanOrEqual(1);
    // Metrics are computed by the platform, not invented by the narrator.
    expect(report.metrics).toBeTruthy();
    expect(typeof report.metrics.attendanceRate).toBe('number');
  });

  it('is idempotent per week — a second generate skips (§37)', async () => {
    const again = await api('post', '/api/v1/me/reports/generate', studentToken);
    expect(again.skipped).toBe(true);
    expect(again.reportId).toBe(reportId);

    const list = await api('get', '/api/v1/me/reports', studentToken);
    const thisWeek = (list as Array<{ id: string }>).filter((r) => r.id === reportId);
    expect(thisWeek).toHaveLength(1);
  });

  it('lets staff list + generate reports for a student', async () => {
    const list = await api('get', `/api/v1/students/${studentId}/reports`, adminToken);
    expect(Array.isArray(list)).toBe(true);
    expect((list as unknown[]).length).toBeGreaterThanOrEqual(1);

    // Idempotent for this week too.
    const gen = await api('post', `/api/v1/students/${studentId}/reports/generate`, adminToken);
    expect(gen.skipped).toBe(true);
  });

  it('enforces access: a student cannot read staff endpoints or others’ reports', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/students/${studentId}/reports`)
      .set(auth(studentToken))
      .expect(403);

    // A different user reading this report by id gets 404 (scoped to owner).
    await request(app.getHttpServer())
      .get(`/api/v1/me/reports/${reportId}`)
      .set(auth(await login('mentor@futurecorpacademy.in')))
      .expect(404);
  });
});
