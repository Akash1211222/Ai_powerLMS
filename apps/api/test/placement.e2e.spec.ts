/**
 * Placement readiness e2e (§24). Runs live in CI. Verifies:
 *   - a student sees their own readiness score, tier and explainable checklist
 *   - staff can read a student's readiness and a batch's cohort rollup
 *   - access is permission-gated (students can't reach staff/cohort endpoints).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaClient } from '@fca/database';

const TEST_DB = process.env.TEST_DATABASE_URL;
const run = TEST_DB ? describe : describe.skip;

run('Placement readiness (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let orgId: string;
  let studentId: string;
  let adminToken: string;
  let studentToken: string;
  let courseId = '';
  let batchId = '';

  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const TIERS = ['READY', 'NEARLY_READY', 'DEVELOPING', 'NOT_READY'];

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB;
    prisma = new PrismaClient({ datasourceUrl: TEST_DB });
    orgId = (await prisma.organization.findUniqueOrThrow({ where: { slug: 'futurecorp-demo' } })).id;
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

    const course = await api('post', '/api/v1/courses', adminToken, { organizationId: orgId, title: `Plc Course ${Date.now()}` });
    courseId = course.id;
    const mod = await api('post', `/api/v1/courses/${courseId}/modules`, adminToken, { title: 'M' });
    await api('post', `/api/v1/courses/modules/${mod.id}/lessons`, adminToken, { title: 'L' });
    await api('post', `/api/v1/courses/${courseId}/publish`, adminToken);
    const batch = await api('post', '/api/v1/batches', adminToken, { organizationId: orgId, courseId, name: `Plc Batch ${Date.now()}` });
    batchId = batch.id;
    await api('post', `/api/v1/batches/${batchId}/students`, adminToken, { email: 'student@futurecorpacademy.in' });
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

  it('gives a student their readiness score, tier and explainable checklist', async () => {
    const r = await api('get', '/api/v1/me/placement', studentToken);
    expect(r.userId).toBe(studentId);
    expect(typeof r.readinessScore).toBe('number');
    expect(TIERS).toContain(r.tier);
    expect(Array.isArray(r.checklist)).toBe(true);
    expect(r.checklist.length).toBeGreaterThanOrEqual(6);
    // Strengths + gaps together account for every checklist item.
    expect(r.strengths.length + r.gaps.length).toBe(r.checklist.length);
    expect(r.components).toHaveProperty('skillMastery');
  });

  it('lets staff read a student’s readiness and the batch cohort rollup', async () => {
    const one = await api('get', `/api/v1/students/${studentId}/placement`, adminToken);
    expect(one.userId).toBe(studentId);

    const cohort = await api('get', `/api/v1/batches/${batchId}/placement`, adminToken);
    expect(cohort.batchId).toBe(batchId);
    expect(cohort.studentCount).toBe(1);
    expect(cohort.students).toHaveLength(1);
    const totalTiers = TIERS.reduce((a, t) => a + (cohort.tierCounts[t] ?? 0), 0);
    expect(totalTiers).toBe(1);
  });

  it('forbids students from staff and cohort endpoints', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/students/${studentId}/placement`)
      .set(auth(studentToken))
      .expect(403);
    await request(app.getHttpServer())
      .get(`/api/v1/batches/${batchId}/placement`)
      .set(auth(studentToken))
      .expect(403);
  });
});
