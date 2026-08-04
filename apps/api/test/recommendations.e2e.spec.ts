/**
 * Personalized recommendations e2e (§22). Runs live in CI. Verifies:
 *   - a student gets a ranked, explainable list of next-best-actions
 *   - a failed-but-retakeable quiz surfaces a RETAKE_QUIZ recommendation
 *   - results are sorted by descending priority and every item has a reason
 *   - staff can read a student's recommendations; students cannot use the
 *     staff-scoped endpoint.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaClient } from '@fca/database';

const TEST_DB = process.env.TEST_DATABASE_URL;
const run = TEST_DB ? describe : describe.skip;

run('Recommendations (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let orgId: string;
  let studentId: string;
  let adminToken: string;
  let studentToken: string;
  let batchId = '';
  let courseId = '';

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

    const course = await api('post', '/api/v1/courses', adminToken, { organizationId: orgId, title: `Rec Course ${Date.now()}` });
    courseId = course.id;
    const mod = await api('post', `/api/v1/courses/${courseId}/modules`, adminToken, { title: 'M' });
    await api('post', `/api/v1/courses/modules/${mod.id}/lessons`, adminToken, { title: 'L1' });
    await api('post', `/api/v1/courses/${courseId}/publish`, adminToken);
    const batch = await api('post', '/api/v1/batches', adminToken, { organizationId: orgId, courseId, name: `Rec Batch ${Date.now()}` });
    batchId = batch.id;
    await api('post', `/api/v1/batches/${batchId}/students`, adminToken, { email: 'student@futurecorpacademy.in' });
  });

  afterAll(async () => {
    if (prisma) {
      if (batchId) {
        await prisma.assessment.deleteMany({ where: { batchId } }).catch(() => undefined);
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

  it('recommends retaking a failed quiz that still has attempts left', async () => {
    // A quiz the student fails but can retake (maxAttempts 3).
    const assessment = await api('post', '/api/v1/assessments', adminToken, {
      batchId,
      title: `Rec Quiz ${Date.now()}`,
      maxAttempts: 3,
      passingScore: 60,
      questions: [
        { type: 'MCQ', prompt: 'Q1', topic: 'SQL', options: [{ text: 'right', isCorrect: true }, { text: 'wrong', isCorrect: false }] },
      ],
    });
    await api('post', `/api/v1/assessments/${assessment.id}/publish`, adminToken);
    const started = await api('post', `/api/v1/assessments/${assessment.id}/attempts`, studentToken);
    const answers = started.questions.map((qq: { id: string; options: { id: string; text: string }[] }) => ({
      questionId: qq.id,
      selectedOptionIds: [qq.options.find((o) => o.text === 'wrong')!.id],
    }));
    await api('post', `/api/v1/assessments/attempts/${started.attemptId}/submit`, studentToken, { answers });

    const recs = await api('get', '/api/v1/me/recommendations', studentToken);
    expect(Array.isArray(recs)).toBe(true);
    expect(recs.length).toBeGreaterThan(0);
    // Sorted by descending priority; every item explains itself.
    for (let i = 1; i < recs.length; i++) expect(recs[i - 1].priority).toBeGreaterThanOrEqual(recs[i].priority);
    expect(recs.every((r: { reason: string }) => typeof r.reason === 'string' && r.reason.length > 0)).toBe(true);

    const retake = recs.find((r: { type: string; target?: { id: string } }) => r.type === 'RETAKE_QUIZ' && r.target?.id === assessment.id);
    expect(retake).toBeTruthy();
    expect(retake.deepLink).toBe(`/courses/${courseId}`);
  });

  it('lets staff read a student’s recommendations', async () => {
    const recs = await api('get', `/api/v1/students/${studentId}/recommendations`, adminToken);
    expect(Array.isArray(recs)).toBe(true);
  });

  it('forbids a student from using the staff-scoped endpoint', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/students/${studentId}/recommendations`)
      .set(auth(studentToken))
      .expect(403);
  });
});
