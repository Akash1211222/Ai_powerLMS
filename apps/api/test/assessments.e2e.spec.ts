/**
 * Assessments e2e (§16). Runs live in CI. Full journey:
 *   admin: course -> batch -> enroll student -> assessment (3 MCQ) -> publish
 *   student: starts attempt (answers hidden), submits mixed answers
 *   -> auto-graded 67%, topic breakdown Pandas 50% / Python 100%
 *   admin: sees the graded attempt + topic breakdown
 *   authorization: student cannot author (403)
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaClient } from '@fca/database';

const TEST_DB = process.env.TEST_DATABASE_URL;
const run = TEST_DB ? describe : describe.skip;

run('Assessments (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let orgId: string;
  let adminToken: string;
  let studentToken: string;
  let courseId = '';
  let batchId = '';
  let assessmentId = '';
  let attemptId = '';
  let startedQuestions: Array<{ id: string; topic: string; options: { id: string; text: string }[] }> = [];

  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB;
    prisma = new PrismaClient({ datasourceUrl: TEST_DB });
    orgId = (await prisma.organization.findUniqueOrThrow({ where: { slug: 'futurecorp-demo' } })).id;

    const { AppModule } = await import('../src/app.module');
    const { AllExceptionsFilter } = await import('../src/common/filters/all-exceptions.filter');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1', { exclude: ['health', 'health/ready'] });
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();

    adminToken = await login('superadmin@futurecorpacademy.in');
    studentToken = await login('student@futurecorpacademy.in');

    const course = await api('post', '/api/v1/courses', adminToken, {
      organizationId: orgId,
      title: `Asmt Course ${Date.now()}`,
    });
    courseId = course.id;
    const mod = await api('post', `/api/v1/courses/${courseId}/modules`, adminToken, { title: 'M' });
    await api('post', `/api/v1/courses/modules/${mod.id}/lessons`, adminToken, { title: 'L' });
    await api('post', `/api/v1/courses/${courseId}/publish`, adminToken);
    const batch = await api('post', '/api/v1/batches', adminToken, {
      organizationId: orgId,
      courseId,
      name: `Asmt Batch ${Date.now()}`,
    });
    batchId = batch.id;
    await api('post', `/api/v1/batches/${batchId}/students`, adminToken, {
      email: 'student@futurecorpacademy.in',
    });
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
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: 'Password123!' })
      .expect(200);
    return res.body.accessToken as string;
  }
  async function api(method: 'post' | 'get', path: string, token: string, body?: unknown) {
    const r = request(app.getHttpServer())[method](path).set(auth(token));
    const res = await (body ? r.send(body) : r);
    if (res.status >= 400) throw new Error(`${method} ${path} -> ${res.status}: ${res.text}`);
    return res.body;
  }

  const mcq = (topic: string) => ({
    type: 'MCQ',
    prompt: `Q about ${topic}`,
    topic,
    options: [
      { text: 'CORRECT', isCorrect: true },
      { text: 'wrong', isCorrect: false },
    ],
  });

  it('authors + publishes an assessment; student starts an attempt with answers hidden', async () => {
    const assessment = await api('post', '/api/v1/assessments', adminToken, {
      batchId,
      title: `Quiz ${Date.now()}`,
      questions: [mcq('Pandas'), mcq('Pandas'), mcq('Python')],
    });
    assessmentId = assessment.id;
    await api('post', `/api/v1/assessments/${assessmentId}/publish`, adminToken);

    const mine = await api('get', '/api/v1/me/assessments', studentToken);
    expect((mine as Array<{ id: string }>).some((a) => a.id === assessmentId)).toBe(true);

    const started = await api('post', `/api/v1/assessments/${assessmentId}/attempts`, studentToken);
    attemptId = started.attemptId;
    startedQuestions = started.questions;
    expect(started.questions).toHaveLength(3);
    // The answer key must never be sent to the client.
    for (const q of started.questions) {
      for (const o of q.options) expect(o).not.toHaveProperty('isCorrect');
    }
  });

  it('grades the attempt: 67% overall, Pandas 50% / Python 100%', async () => {
    // Answer Pandas #2 (index 1) wrong; the other two correct.
    const answers = startedQuestions.map((q, i) => {
      const wanted = i === 1 ? 'wrong' : 'CORRECT';
      const opt = q.options.find((o) => o.text === wanted)!;
      return { questionId: q.id, selectedOptionIds: [opt.id] };
    });

    const result = await api('post', `/api/v1/assessments/attempts/${attemptId}/submit`, studentToken, {
      answers,
    });
    expect(result.percent).toBe(67);
    const topics = result.topics as Array<{ topic: string; percent: number }>;
    expect(topics.find((t) => t.topic === 'Pandas')?.percent).toBe(50);
    expect(topics.find((t) => t.topic === 'Python')?.percent).toBe(100);

    const staffAttempts = await api('get', `/api/v1/assessments/${assessmentId}/attempts`, adminToken);
    expect((staffAttempts as Array<{ id: string }>).some((a) => a.id === attemptId)).toBe(true);

    const mine = await api('get', `/api/v1/me/assessments/attempts/${attemptId}`, studentToken);
    expect(mine.percent).toBe(67);
  });

  it('forbids a student from authoring an assessment (403)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/assessments')
      .set(auth(studentToken))
      .send({ batchId, title: 'Nope', questions: [mcq('X')] })
      .expect(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });
});
