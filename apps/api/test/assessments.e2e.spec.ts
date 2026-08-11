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
  async function api(method: 'post' | 'get' | 'patch', path: string, token: string, body?: unknown) {
    const r = request(app.getHttpServer())[method](path).set(auth(token));
    const res = await (body ? r.send(body) : r);
    if (res.status >= 400) throw new Error(`${method} ${path} -> ${res.status}: ${res.text}`);
    return res.body;
  }

  /** Returns the status instead of throwing, for the refusal assertions. */
  async function rawStatus(
    method: 'patch',
    path: string,
    token: string,
    body?: unknown,
  ): Promise<number> {
    const r = request(app.getHttpServer())[method](path).set(auth(token));
    const res = await (body ? r.send(body) : r);
    return res.status;
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

  it('AI-generated quizzes are drafted for review, with the question count the trainer asked for', async () => {
    const generated = await api('post', '/api/v1/assessments/ai-generate', adminToken, {
      batchId,
      topicHint: 'python basics',
      questionCount: 5,
    });
    expect(generated.status).toBe('DRAFT');

    // The trainer's count is honoured, so review is a known quantity.
    const detail = await api('get', `/api/v1/assessments/${generated.id}`, adminToken);
    expect(detail.questions).toHaveLength(5);

    // Nothing reaches the class until it is published.
    const before = await api('get', '/api/v1/me/assessments', studentToken);
    expect((before as Array<{ id: string }>).map((a) => a.id)).not.toContain(generated.id);

    await api('post', `/api/v1/assessments/${generated.id}/publish`, adminToken);
    const after = await api('get', '/api/v1/me/assessments', studentToken);
    expect((after as Array<{ id: string }>).map((a) => a.id)).toContain(generated.id);
  });

  it('lets a trainer rewrite a draft quiz — prompts, answers and the marked option', async () => {
    const draft = await api('post', '/api/v1/assessments', adminToken, {
      batchId,
      title: `Editable ${Date.now()}`,
      questions: [mcq('Pandas'), mcq('Python')],
    });

    const edited = await api('patch', `/api/v1/assessments/${draft.id}`, adminToken, {
      title: 'Reviewed by the trainer',
      passingScore: 70,
      questions: [
        {
          type: 'MCQ',
          prompt: 'Rewritten prompt — which keyword defines a function?',
          topic: 'Python',
          explanation: 'def introduces a function definition.',
          options: [
            { text: 'def', isCorrect: true },
            { text: 'func', isCorrect: false },
            { text: 'lambda', isCorrect: false },
          ],
        },
      ],
    });

    expect(edited.title).toBe('Reviewed by the trainer');
    expect(edited.passingScore).toBe(70);
    // The whole paper is replaced, so the old questions are gone.
    expect(edited.questions).toHaveLength(1);
    expect(edited.questions[0].prompt).toContain('Rewritten prompt');
    expect(edited.questions[0].explanation).toContain('def introduces');
    const correct = edited.questions[0].options.filter((o: { isCorrect: boolean }) => o.isCorrect);
    expect(correct).toHaveLength(1);
    expect(correct[0].text).toBe('def');
  });

  it('refuses an unanswerable edit, and refuses to edit a published quiz', async () => {
    const draft = await api('post', '/api/v1/assessments', adminToken, {
      batchId,
      title: `Guarded ${Date.now()}`,
      questions: [mcq('Pandas')],
    });

    // An MCQ with no correct option could never be marked.
    expect(
      await rawStatus('patch', `/api/v1/assessments/${draft.id}`, adminToken, {
        questions: [
          {
            type: 'MCQ',
            prompt: 'No right answer here',
            options: [
              { text: 'a', isCorrect: false },
              { text: 'b', isCorrect: false },
            ],
          },
        ],
      }),
    ).toBe(400);

    // Once it is live, the paper is frozen — students may already be sitting it.
    await api('post', `/api/v1/assessments/${draft.id}/publish`, adminToken);
    expect(
      await rawStatus('patch', `/api/v1/assessments/${draft.id}`, adminToken, {
        title: 'too late',
      }),
    ).toBe(400);
  });

  it('flags an attempt submitted past its time limit, and records integrity signals', async () => {
    const quiz = await api('post', '/api/v1/assessments', adminToken, {
      batchId,
      title: `Timed ${Date.now()}`,
      timeLimitMin: 10,
      questions: [mcq('Pandas')],
    });
    await api('post', `/api/v1/assessments/${quiz.id}/publish`, adminToken);
    const started = await api('post', `/api/v1/assessments/${quiz.id}/attempts`, studentToken);

    // The browser reports leaving the tab twice and pasting once.
    await api('post', `/api/v1/assessments/attempts/${started.attemptId}/integrity`, studentToken, {
      blur: 2,
      paste: 1,
      awayMs: 45_000,
    });

    // Backdate the start so the submission lands well past the limit; the
    // clock the server trusts is startedAt, not anything the client sends.
    await prisma.assessmentAttempt.update({
      where: { id: started.attemptId },
      data: { startedAt: new Date(Date.now() - 40 * 60_000) },
    });

    await api('post', `/api/v1/assessments/attempts/${started.attemptId}/submit`, studentToken, {
      answers: [],
    });

    const row = await prisma.assessmentAttempt.findUniqueOrThrow({
      where: { id: started.attemptId },
    });
    // Overrunning still grades — a slow connection must not be punished like a
    // cheat — but the trainer can see it happened.
    expect(row.status).toBe('GRADED');
    expect(row.autoSubmitted).toBe(true);
    expect(row.blurCount).toBe(2);
    expect(row.pasteCount).toBe(1);
    expect(row.awayMs).toBe(45_000);

    // The trainer's attempt list carries the signals.
    const attempts = await api('get', `/api/v1/assessments/${quiz.id}/attempts`, adminToken);
    const mine = (attempts as Array<{ id: string; autoSubmitted: boolean; blurCount: number }>).find(
      (a) => a.id === started.attemptId,
    );
    expect(mine?.autoSubmitted).toBe(true);
    expect(mine?.blurCount).toBe(2);
  });

  it('leaves an attempt inside its time limit unflagged', async () => {
    const quiz = await api('post', '/api/v1/assessments', adminToken, {
      batchId,
      title: `In time ${Date.now()}`,
      timeLimitMin: 30,
      questions: [mcq('Pandas')],
    });
    await api('post', `/api/v1/assessments/${quiz.id}/publish`, adminToken);
    const started = await api('post', `/api/v1/assessments/${quiz.id}/attempts`, studentToken);
    await api('post', `/api/v1/assessments/attempts/${started.attemptId}/submit`, studentToken, {
      answers: [],
    });

    const row = await prisma.assessmentAttempt.findUniqueOrThrow({
      where: { id: started.attemptId },
    });
    expect(row.autoSubmitted).toBe(false);
    expect(row.blurCount).toBe(0);
  });

  it('stops accepting integrity reports once the attempt is graded', async () => {
    const quiz = await api('post', '/api/v1/assessments', adminToken, {
      batchId,
      title: `Closed ${Date.now()}`,
      questions: [mcq('Pandas')],
    });
    await api('post', `/api/v1/assessments/${quiz.id}/publish`, adminToken);
    const started = await api('post', `/api/v1/assessments/${quiz.id}/attempts`, studentToken);
    await api('post', `/api/v1/assessments/attempts/${started.attemptId}/submit`, studentToken, {
      answers: [],
    });

    const res = await api(
      'post',
      `/api/v1/assessments/attempts/${started.attemptId}/integrity`,
      studentToken,
      { blur: 5 },
    );
    expect(res.recorded).toBe(false);
    const row = await prisma.assessmentAttempt.findUniqueOrThrow({
      where: { id: started.attemptId },
    });
    // A graded attempt is history — late reports cannot rewrite it.
    expect(row.blurCount).toBe(0);
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
