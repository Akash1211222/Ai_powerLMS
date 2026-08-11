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
  async function api(method: 'post' | 'get' | 'patch', path: string, token: string, body?: unknown) {
    const r = request(app.getHttpServer())[method](path).set(auth(token));
    const res = await (body ? r.send(body) : r);
    if (res.status >= 400) throw new Error(`${method} ${path} -> ${res.status}: ${res.text}`);
    return res.body;
  }

  /** Returns the status instead of throwing, for the refusal assertions. */
  async function rawStatus(
    method: 'patch' | 'get',
    path: string,
    token: string,
    body?: unknown,
  ): Promise<number> {
    const r = request(app.getHttpServer())[method](path).set(auth(token));
    const res = await (body ? r.send(body) : r);
    return res.status;
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

  it('lets a trainer edit a draft assignment and its rubric, then refuses once it is live', async () => {
    const draft = await api('post', '/api/v1/assignments', adminToken, {
      batchId,
      title: `Editable ${Date.now()}`,
      instructions: 'First draft of the brief.',
      criteria: [{ title: 'Correctness', weight: 100 }],
    });
    expect(draft.status).toBe('DRAFT');

    const edited = await api('patch', `/api/v1/assignments/${draft.id}`, adminToken, {
      title: 'Reviewed brief',
      instructions: 'Rewritten by the trainer after reading the AI draft.',
      maxScore: 50,
      criteria: [
        { title: 'Correctness', weight: 60 },
        { title: 'Readability', weight: 40 },
      ],
    });
    expect(edited.title).toBe('Reviewed brief');
    expect(edited.maxScore).toBe(50);
    expect(edited.instructions).toContain('Rewritten by the trainer');
    expect(edited.criteria).toHaveLength(2);
    expect(edited.criteria.map((c: { title: string }) => c.title)).toEqual([
      'Correctness',
      'Readability',
    ]);

    // Published work is frozen: the rubric backs scores that already exist.
    await api('post', `/api/v1/assignments/${draft.id}/publish`, adminToken);
    expect(
      await rawStatus('patch', `/api/v1/assignments/${draft.id}`, adminToken, { title: 'too late' }),
    ).toBe(400);
  });

  it('runs a coding submission against the trainer\'s test cases and hides the hidden ones', async () => {
    const draft = await api('post', '/api/v1/assignments', adminToken, {
      batchId,
      title: `Doubler ${Date.now()}`,
      instructions: 'Read an integer from stdin and print double it.',
      language: 'PYTHON',
      criteria: [{ title: 'Correctness', weight: 100 }],
    });

    await api('patch', `/api/v1/assignments/${draft.id}`, adminToken, {
      testCases: [
        { name: 'sample', stdin: '2\n', expectedOutput: '4', isHidden: false },
        { name: 'zero', stdin: '0\n', expectedOutput: '0', isHidden: false },
        // Withheld so a solution has to generalise rather than hardcode.
        { name: 'large', stdin: '1000\n', expectedOutput: '2000', isHidden: true },
      ],
    });
    await api('post', `/api/v1/assignments/${draft.id}/publish`, adminToken);

    // A correct solution: reads stdin, doubles it.
    await api('post', `/api/v1/assignments/${draft.id}/submit`, studentToken, {
      contentText: 'n = int(input())\nprint(n * 2)\n',
    });

    const mine = await api('get', `/api/v1/me/assignments/${draft.id}`, studentToken);
    const results = mine.submission.testResults as Array<{
      name: string;
      passed: boolean;
      isHidden: boolean;
      stdin: string | null;
      expectedOutput: string | null;
    }>;

    expect(mine.submission.testSummary).toEqual({ passed: 3, total: 3 });
    expect(results).toHaveLength(3);
    expect(results.every((r) => r.passed)).toBe(true);

    // Pass/fail is feedback; the hidden case's data is not.
    const hidden = results.find((r) => r.isHidden)!;
    expect(hidden.passed).toBe(true);
    expect(hidden.stdin).toBeNull();
    expect(hidden.expectedOutput).toBeNull();
    const visible = results.find((r) => !r.isHidden)!;
    expect(visible.expectedOutput).not.toBeNull();
  });

  it('marks a wrong solution as failing, from executed code rather than the claimed output', async () => {
    const draft = await api('post', '/api/v1/assignments', adminToken, {
      batchId,
      title: `Doubler wrong ${Date.now()}`,
      language: 'PYTHON',
      criteria: [{ title: 'Correctness', weight: 100 }],
    });
    await api('patch', `/api/v1/assignments/${draft.id}`, adminToken, {
      testCases: [
        { name: 'two', stdin: '2\n', expectedOutput: '4' },
        { name: 'three', stdin: '3\n', expectedOutput: '6' },
      ],
    });
    await api('post', `/api/v1/assignments/${draft.id}/publish`, adminToken);

    // Adds instead of doubling, and claims a passing output in codeOutput —
    // which the server must ignore in favour of running the source.
    await api('post', `/api/v1/assignments/${draft.id}/submit`, studentToken, {
      contentText: 'n = int(input())\nprint(n + 1)\n',
      codeOutput: '4\n6\n',
    });

    const mine = await api('get', `/api/v1/me/assignments/${draft.id}`, studentToken);
    expect(mine.submission.testSummary).toEqual({ passed: 0, total: 2 });
    const first = mine.submission.testResults[0];
    expect(first.passed).toBe(false);
    // The student can see what their code actually printed for a visible case.
    expect(first.actualOutput.trim()).toBe('3');
  });

  it('gives a student a hint that points at the failure without handing over the fix', async () => {
    const draft = await api('post', '/api/v1/assignments', adminToken, {
      batchId,
      title: `Hint me ${Date.now()}`,
      instructions: 'Read an integer and print its double.',
      language: 'PYTHON',
      criteria: [{ title: 'Correctness', weight: 100 }],
    });
    await api('patch', `/api/v1/assignments/${draft.id}`, adminToken, {
      testCases: [
        { name: 'two', stdin: '2\n', expectedOutput: '4' },
        { name: 'ten', stdin: '10\n', expectedOutput: '20' },
      ],
    });
    await api('post', `/api/v1/assignments/${draft.id}/publish`, adminToken);

    // Crashes on a name that was never defined — a diagnosable runtime error.
    await api('post', `/api/v1/assignments/${draft.id}/submit`, studentToken, {
      contentText: 'n = int(input())\nprint(undefined_name * 2)\n',
    });

    const hint = await api('get', `/api/v1/assignments/${draft.id}/hint`, studentToken);
    expect(hint.diagnosis).toBeTruthy();
    expect(hint.explanation).toBeTruthy();
    expect(hint.hint).toBeTruthy();
    // The traceback names line 2, and that is where the mistake is.
    expect(hint.line).toBe(2);
    // A hint containing the fix turns the attempt into a copy-paste.
    expect(hint.hint).not.toContain('```');
    expect(hint.hint).not.toContain('n * 2');
  });

  it('refuses a hint when there is nothing wrong to explain', async () => {
    const draft = await api('post', '/api/v1/assignments', adminToken, {
      batchId,
      title: `All good ${Date.now()}`,
      language: 'PYTHON',
      criteria: [{ title: 'Correctness', weight: 100 }],
    });
    await api('patch', `/api/v1/assignments/${draft.id}`, adminToken, {
      testCases: [{ name: 'two', stdin: '2\n', expectedOutput: '4' }],
    });
    await api('post', `/api/v1/assignments/${draft.id}/publish`, adminToken);
    await api('post', `/api/v1/assignments/${draft.id}/submit`, studentToken, {
      contentText: 'n = int(input())\nprint(n * 2)\n',
    });

    expect(await rawStatus('get', `/api/v1/assignments/${draft.id}/hint`, studentToken)).toBe(400);
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
