/**
 * Performance scoring e2e (§17). Runs live in CI. A student submits a quiz;
 * their composite scores are computed with an explainable component breakdown.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaClient } from '@fca/database';

const TEST_DB = process.env.TEST_DATABASE_URL;
const run = TEST_DB ? describe : describe.skip;

run('Performance scores (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let orgId: string;
  let studentId: string;
  let adminToken: string;
  let studentToken: string;
  let courseId = '';
  let batchId = '';

  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

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

    const course = await api('post', '/api/v1/courses', adminToken, { organizationId: orgId, title: `Score Course ${Date.now()}` });
    courseId = course.id;
    const mod = await api('post', `/api/v1/courses/${courseId}/modules`, adminToken, { title: 'M' });
    await api('post', `/api/v1/courses/modules/${mod.id}/lessons`, adminToken, { title: 'L' });
    await api('post', `/api/v1/courses/${courseId}/publish`, adminToken);
    const batch = await api('post', '/api/v1/batches', adminToken, { organizationId: orgId, courseId, name: `Score Batch ${Date.now()}` });
    batchId = batch.id;
    await api('post', `/api/v1/batches/${batchId}/students`, adminToken, { email: 'student@futurecorpacademy.in' });
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.studentScore.deleteMany({ where: { userId: studentId } }).catch(() => undefined);
      await prisma.studentSkill.deleteMany({ where: { userId: studentId } }).catch(() => undefined);
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

  it('computes composite scores after a quiz submission', async () => {
    const assessment = await api('post', '/api/v1/assessments', adminToken, {
      batchId,
      title: `Score Quiz ${Date.now()}`,
      questions: [
        { type: 'MCQ', prompt: 'Q1', topic: 'Pandas', options: [{ text: 'CORRECT', isCorrect: true }, { text: 'w', isCorrect: false }] },
        { type: 'MCQ', prompt: 'Q2', topic: 'SQL', options: [{ text: 'CORRECT', isCorrect: true }, { text: 'w', isCorrect: false }] },
      ],
    });
    await api('post', `/api/v1/assessments/${assessment.id}/publish`, adminToken);
    const started = await api('post', `/api/v1/assessments/${assessment.id}/attempts`, studentToken);
    const answers = started.questions.map((q: { id: string; options: { id: string; text: string }[] }) => ({
      questionId: q.id,
      selectedOptionIds: [q.options.find((o) => o.text === 'CORRECT')!.id],
    }));
    await api('post', `/api/v1/assessments/attempts/${started.attemptId}/submit`, studentToken, { answers });

    const score = await api('get', '/api/v1/me/score', studentToken);
    expect(score).toBeTruthy();
    expect(score.overallScore).toBeGreaterThan(0);
    expect(score.performanceScore).toBe(100); // all correct
    expect(score.components).toHaveProperty('weights');
  });

  it('lets staff read a student score but forbids a student from reading others', async () => {
    const staff = await api('get', `/api/v1/students/${studentId}/score`, adminToken);
    expect(staff.overallScore).toBeGreaterThanOrEqual(0);
    await request(app.getHttpServer())
      .get(`/api/v1/students/${studentId}/score`)
      .set(auth(studentToken))
      .expect(403);
  });
});
