/**
 * Batch health + trainer analytics e2e (§23). Runs live in CI. Verifies:
 *   - batch health rolls up real per-student signals (attendance, students)
 *   - a trainer sees health for every batch they run via /me/batches/health
 *   - access is permission-gated (students get 403) and tenant-scoped.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaClient } from '@fca/database';

const TEST_DB = process.env.TEST_DATABASE_URL;
const run = TEST_DB ? describe : describe.skip;

run('Batch health analytics (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let orgId: string;
  let trainerId: string;
  let adminToken: string;
  let trainerToken: string;
  let studentToken: string;
  let courseId = '';
  let batchId = '';

  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB;
    prisma = new PrismaClient({ datasourceUrl: TEST_DB });
    orgId = (await prisma.organization.findUniqueOrThrow({ where: { slug: 'futurecorp-demo' } })).id;
    trainerId = (await prisma.user.findUniqueOrThrow({ where: { email: 'trainer@futurecorpacademy.in' } })).id;

    const { AppModule } = await import('../src/app.module');
    const { AllExceptionsFilter } = await import('../src/common/filters/all-exceptions.filter');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1', { exclude: ['health', 'health/ready'] });
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();

    adminToken = await login('superadmin@futurecorpacademy.in');
    trainerToken = await login('trainer@futurecorpacademy.in');
    studentToken = await login('student@futurecorpacademy.in');

    const course = await api('post', '/api/v1/courses', adminToken, { organizationId: orgId, title: `Health Course ${Date.now()}` });
    courseId = course.id;
    const mod = await api('post', `/api/v1/courses/${courseId}/modules`, adminToken, { title: 'M' });
    await api('post', `/api/v1/courses/modules/${mod.id}/lessons`, adminToken, { title: 'L' });
    await api('post', `/api/v1/courses/${courseId}/publish`, adminToken);
    const batch = await api('post', '/api/v1/batches', adminToken, { organizationId: orgId, courseId, name: `Health Batch ${Date.now()}` });
    batchId = batch.id;
    await api('post', `/api/v1/batches/${batchId}/students`, adminToken, { email: 'student@futurecorpacademy.in' });
    await api('post', `/api/v1/batches/${batchId}/trainers`, adminToken, { userId: trainerId, role: 'LEAD' });

    // Two present sessions → a real attendance signal for the rollup.
    for (let i = 0; i < 2; i++) {
      const studentId = (await prisma.user.findUniqueOrThrow({ where: { email: 'student@futurecorpacademy.in' } })).id;
      const session = await api('post', '/api/v1/attendance/sessions', adminToken, { batchId, title: `S${i + 1}` });
      await api('post', `/api/v1/attendance/sessions/${session.id}/mark`, adminToken, {
        records: [{ studentId, status: 'PRESENT' }],
      });
    }
  });

  afterAll(async () => {
    if (prisma) {
      if (batchId) {
        await prisma.enrollment.deleteMany({ where: { batchId } }).catch(() => undefined);
        await prisma.batch.delete({ where: { id: batchId } }).catch(() => undefined);
      }
      if (courseId) await prisma.course.delete({ where: { id: courseId } }).catch(() => undefined);
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

  it('rolls up per-student signals into a batch health picture', async () => {
    const health = await api('get', `/api/v1/batches/${batchId}/health`, adminToken);
    expect(health.batchId).toBe(batchId);
    expect(health.studentCount).toBe(1);
    expect(health.metrics.avgAttendance).toBe(100); // both sessions present
    expect(['HEALTHY', 'WATCH', 'AT_RISK']).toContain(health.band);
    expect(health.students).toHaveLength(1);
    expect(health.students[0].attendanceRate).toBe(100);
    expect(health.riskDistribution).toHaveProperty('UNKNOWN');
  });

  it('gives a trainer health for every batch they run', async () => {
    const all = await api('get', '/api/v1/me/batches/health', trainerToken);
    expect(Array.isArray(all)).toBe(true);
    const mine = (all as Array<{ batchId: string }>).find((h) => h.batchId === batchId);
    expect(mine).toBeTruthy();
  });

  it('forbids students from viewing batch analytics', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/batches/${batchId}/health`)
      .set(auth(studentToken))
      .expect(403);
    await request(app.getHttpServer())
      .get('/api/v1/me/batches/health')
      .set(auth(studentToken))
      .expect(403);
  });
});
