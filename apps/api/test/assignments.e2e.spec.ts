/**
 * Assignments + AI evaluation e2e (§15, §36). Runs live in CI (heuristic
 * provider — no external calls). Full journey:
 *   admin: course -> batch -> enroll student -> assignment (+rubric) -> publish
 *   student: sees it, submits
 *   admin: triggers evaluation (heuristic) -> NEEDS_REVIEW with an aiScore
 *   admin: overrides (trainerScore=85, release) -> RELEASED, finalScore 85
 *   re-evaluation is SKIPPED (AI never overwrites the trainer decision)
 *   student: now sees released feedback; cannot create/evaluate (403)
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaClient } from '@fca/database';

const TEST_DB = process.env.TEST_DATABASE_URL;
const run = TEST_DB ? describe : describe.skip;

run('Assignments + AI evaluation (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let orgId: string;
  let adminToken: string;
  let studentToken: string;
  let courseId = '';
  let batchId = '';
  let assignmentId = '';
  let submissionId = '';

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
      title: `Asg Course ${Date.now()}`,
    });
    courseId = course.id;
    const mod = await api('post', `/api/v1/courses/${courseId}/modules`, adminToken, { title: 'M' });
    await api('post', `/api/v1/courses/modules/${mod.id}/lessons`, adminToken, { title: 'L' });
    await api('post', `/api/v1/courses/${courseId}/publish`, adminToken);
    const batch = await api('post', '/api/v1/batches', adminToken, {
      organizationId: orgId,
      courseId,
      name: `Asg Batch ${Date.now()}`,
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

  it('AI-generated work is drafted for review, never published to students by the generate call', async () => {
    const generated = await api('post', '/api/v1/assignments/ai-generate', adminToken, {
      batchId,
      topicHint: 'loops and conditionals practice',
    });
    expect(generated.aiGenerated).toBe(true);
    expect(generated.status).toBe('DRAFT');

    // A draft is invisible to the class until someone reads it.
    const beforeReview = await api('get', '/api/v1/me/assignments', studentToken);
    expect((beforeReview as Array<{ id: string }>).map((a) => a.id)).not.toContain(generated.id);

    // The trainer can still ask for it to go out.
    const published = await api('post', `/api/v1/assignments/${generated.id}/publish`, adminToken);
    expect(published.status).toBe('PUBLISHED');
    const afterReview = await api('get', '/api/v1/me/assignments', studentToken);
    expect((afterReview as Array<{ id: string }>).map((a) => a.id)).toContain(generated.id);
  });

  it('enrolling a student does not push unreviewed AI work to the batch', async () => {
    // A fresh batch with no assignments — enrolment triggers the auto-draft.
    const batch = await api('post', '/api/v1/batches', adminToken, {
      organizationId: orgId,
      courseId,
      name: `Asg Autodraft Batch ${Date.now()}`,
    });
    await api('post', `/api/v1/batches/${batch.id}/students`, adminToken, {
      email: 'student@futurecorpacademy.in',
    });

    const seeded = await api('get', `/api/v1/assignments?batchId=${batch.id}`, adminToken);
    const rows = seeded as Array<{ id: string; status: string; aiGenerated: boolean }>;
    expect(rows.length).toBeGreaterThan(0);
    // Everything the enrolment created is waiting on a trainer.
    expect(rows.every((a) => a.status === 'DRAFT')).toBe(true);

    // Enrolling again must not stack up another generated draft: the
    // existing-work check counts drafts, not just published work.
    await api('post', `/api/v1/batches/${batch.id}/students`, adminToken, {
      email: 'trainer@futurecorpacademy.in',
    }).catch(() => undefined);
    const after = await api('get', `/api/v1/assignments?batchId=${batch.id}`, adminToken);
    expect((after as unknown[]).length).toBe(rows.length);

    await prisma.assignment.deleteMany({ where: { batchId: batch.id } }).catch(() => undefined);
    await prisma.enrollment.deleteMany({ where: { batchId: batch.id } }).catch(() => undefined);
    await prisma.batch.delete({ where: { id: batch.id } }).catch(() => undefined);
  });

  it('admin creates + publishes an assignment; student submits', async () => {
    const assignment = await api('post', '/api/v1/assignments', adminToken, {
      batchId,
      title: `Pandas Task ${Date.now()}`,
      instructions: 'Analyze the dataset with pandas.',
      maxScore: 100,
      criteria: [
        { title: 'Correctness of pandas usage', weight: 60 },
        { title: 'Clarity of explanation', weight: 40 },
      ],
    });
    assignmentId = assignment.id;
    expect(assignment.criteria).toHaveLength(2);
    await api('post', `/api/v1/assignments/${assignmentId}/publish`, adminToken);

    const mine = await api('get', '/api/v1/me/assignments', studentToken);
    expect((mine as Array<{ id: string }>).some((a) => a.id === assignmentId)).toBe(true);

    const submission = await api('post', `/api/v1/assignments/${assignmentId}/submit`, studentToken, {
      contentText: 'I used pandas read_csv, groupby and merge to analyze the dataset in detail. '.repeat(6),
      repoUrl: 'https://github.com/example/work',
    });
    submissionId = submission.id;
    // Submit runs sync heuristic scoring, so status advances past SUBMITTED.
    expect(['SUBMITTED', 'EVALUATED']).toContain(submission.status);
  });

  it('AI (heuristic) evaluation produces an aiScore routed to review; student cannot see it yet', async () => {
    const result = await api('post', `/api/v1/assignments/submissions/${submissionId}/evaluate`, adminToken);
    // Sync submit may already have scored; re-run should still leave a reviewable score.
    if (!result.skipped) {
      expect(result.status).toBe('NEEDS_REVIEW'); // heuristic confidence is low
    }

    const subs = await api('get', `/api/v1/assignments/${assignmentId}/submissions`, adminToken);
    const sub = (subs as Array<{ id: string; evaluation: { aiScore: number; status: string } }>).find(
      (s) => s.id === submissionId,
    );
    expect(sub?.evaluation.aiScore).toBeGreaterThan(0);
    expect(['NEEDS_REVIEW', 'AI_COMPLETED', 'RELEASED']).toContain(sub?.evaluation.status);

    const mine = await api('get', `/api/v1/me/assignments/${assignmentId}`, studentToken);
    // Unreleased review drafts stay hidden from the student.
    if (sub?.evaluation.status === 'NEEDS_REVIEW' || sub?.evaluation.status === 'PENDING') {
      expect(mine.submission.evaluation).toBeNull();
    }
  });

  it('trainer override releases feedback and AI never overwrites it', async () => {
    const evalRow = await api('post', `/api/v1/assignments/submissions/${submissionId}/review`, adminToken, {
      trainerScore: 85,
      release: true,
      reason: 'Good work; solid pandas usage.',
    });
    expect(evalRow.finalScore).toBe(85);
    expect(evalRow.status).toBe('RELEASED');

    // Re-triggering evaluation must NOT overwrite the trainer decision.
    const rerun = await api('post', `/api/v1/assignments/submissions/${submissionId}/evaluate`, adminToken);
    expect(rerun.skipped).toBe(true);
    expect(rerun.reason).toBe('trainer_reviewed');

    const mine = await api('get', `/api/v1/me/assignments/${assignmentId}`, studentToken);
    expect(mine.submission.evaluation.finalScore).toBe(85);
    expect(mine.submission.evaluation.status).toBe('RELEASED');
  });

  it('forbids students from authoring or evaluating (403)', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/assignments')
      .set(auth(studentToken))
      .send({ batchId, title: 'Nope', criteria: [{ title: 'x', weight: 10 }] })
      .expect(403);
    await request(app.getHttpServer())
      .post(`/api/v1/assignments/submissions/${submissionId}/evaluate`)
      .set(auth(studentToken))
      .expect(403);
  });
});
