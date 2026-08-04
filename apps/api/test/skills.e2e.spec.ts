/**
 * Skill matrix e2e (§20). Runs live in CI. A student takes a topic-tagged quiz;
 * submitting it recomputes their skill profile from the topic-level results.
 *   student: Pandas 100%, SQL 50%  ->  /me/skills reflects it
 *   staff:   /students/:id/skills shows the same with underlying evidence
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaClient } from '@fca/database';

const TEST_DB = process.env.TEST_DATABASE_URL;
const run = TEST_DB ? describe : describe.skip;

run('Skill matrix (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let orgId: string;
  let studentId: string;
  let adminToken: string;
  let studentToken: string;
  let courseId = '';
  let batchId = '';
  let assessmentId = '';

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

    const course = await api('post', '/api/v1/courses', adminToken, { organizationId: orgId, title: `Skill Course ${Date.now()}` });
    courseId = course.id;
    const mod = await api('post', `/api/v1/courses/${courseId}/modules`, adminToken, { title: 'M' });
    await api('post', `/api/v1/courses/modules/${mod.id}/lessons`, adminToken, { title: 'L' });
    await api('post', `/api/v1/courses/${courseId}/publish`, adminToken);
    const batch = await api('post', '/api/v1/batches', adminToken, { organizationId: orgId, courseId, name: `Skill Batch ${Date.now()}` });
    batchId = batch.id;
    await api('post', `/api/v1/batches/${batchId}/students`, adminToken, { email: 'student@futurecorpacademy.in' });
  });

  afterAll(async () => {
    if (prisma) {
      // Remove skills derived from this test's attempts so state stays clean.
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

  const mcq = (topic: string) => ({
    type: 'MCQ',
    prompt: `${topic} question`,
    topic,
    options: [
      { text: 'CORRECT', isCorrect: true },
      { text: 'wrong', isCorrect: false },
    ],
  });

  it('exposes the skill taxonomy', async () => {
    const tax = await api('get', '/api/v1/skills', adminToken);
    expect(Array.isArray(tax)).toBe(true);
    const names = (tax as Array<{ skills: { name: string }[] }>).flatMap((c) => c.skills.map((s) => s.name));
    expect(names).toContain('Pandas');
    expect(names).toContain('SQL');
  });

  it('computes a skill profile from a submitted quiz', async () => {
    const assessment = await api('post', '/api/v1/assessments', adminToken, {
      batchId,
      title: `Skill Quiz ${Date.now()}`,
      questions: [mcq('Pandas'), mcq('Pandas'), mcq('SQL'), mcq('SQL')],
    });
    assessmentId = assessment.id;
    await api('post', `/api/v1/assessments/${assessmentId}/publish`, adminToken);

    const started = await api('post', `/api/v1/assessments/${assessmentId}/attempts`, studentToken);
    // Pandas: both correct. SQL: one correct, one wrong.
    const answers = started.questions.map((q: { id: string; topic: string; options: { id: string; text: string }[] }, i: number) => {
      const wanted = q.topic === 'SQL' && i === 3 ? 'wrong' : 'CORRECT';
      return { questionId: q.id, selectedOptionIds: [q.options.find((o) => o.text === wanted)!.id] };
    });
    await api('post', `/api/v1/assessments/attempts/${started.attemptId}/submit`, studentToken, { answers });

    const mySkills = await api('get', '/api/v1/me/skills', studentToken);
    const pandas = (mySkills as Array<{ name: string; score: number }>).find((s) => s.name === 'Pandas');
    const sql = (mySkills as Array<{ name: string; score: number }>).find((s) => s.name === 'SQL');
    expect(pandas?.score).toBe(100);
    expect(sql?.score).toBe(50);
  });

  it('lets staff drill into a student’s skills with evidence', async () => {
    const staffView = await api('get', `/api/v1/students/${studentId}/skills`, adminToken);
    const pandas = (staffView as Array<{ name: string; evidence: unknown[] }>).find((s) => s.name === 'Pandas');
    expect(pandas).toBeTruthy();
    expect(pandas!.evidence.length).toBeGreaterThan(0);
  });
});
