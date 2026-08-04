/**
 * Intervention workflow e2e (§19). Runs live in CI. The full loop:
 *   absences + a failed quiz -> risk escalates -> intervention AUTO-created ->
 *   recovery plan generated (heuristic, schema-validated) -> student sees plan
 *   -> completes tasks -> platform recalculates -> staff resolves.
 *   Idempotency: re-evaluating risk never duplicates the intervention (§37).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaClient } from '@fca/database';

const TEST_DB = process.env.TEST_DATABASE_URL;
const run = TEST_DB ? describe : describe.skip;

run('Intervention workflow (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let orgId: string;
  let studentId: string;
  let adminToken: string;
  let studentToken: string;
  let courseId = '';
  let batchId = '';
  let interventionId = '';
  let taskIds: string[] = [];

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

    // Deterministic baseline: wipe this student's intelligence state.
    await prisma.studentIntervention.deleteMany({ where: { userId: studentId } });
    await prisma.studentRiskSnapshot.deleteMany({ where: { userId: studentId } });
    await prisma.studentScore.deleteMany({ where: { userId: studentId } });
    await prisma.studentSkill.deleteMany({ where: { userId: studentId } });

    const course = await api('post', '/api/v1/courses', adminToken, { organizationId: orgId, title: `Intv Course ${Date.now()}` });
    courseId = course.id;
    const mod = await api('post', `/api/v1/courses/${courseId}/modules`, adminToken, { title: 'M' });
    await api('post', `/api/v1/courses/modules/${mod.id}/lessons`, adminToken, { title: 'L' });
    await api('post', `/api/v1/courses/${courseId}/publish`, adminToken);
    const batch = await api('post', '/api/v1/batches', adminToken, { organizationId: orgId, courseId, name: `Intv Batch ${Date.now()}` });
    batchId = batch.id;
    await api('post', `/api/v1/batches/${batchId}/students`, adminToken, { email: 'student@futurecorpacademy.in' });
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.studentIntervention.deleteMany({ where: { userId: studentId } }).catch(() => undefined);
      await prisma.studentRiskSnapshot.deleteMany({ where: { userId: studentId } }).catch(() => undefined);
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

  it('auto-creates an intervention with a recovery plan when risk escalates', async () => {
    // 5 absences (attendance + consecutive-absence factors)...
    for (let i = 0; i < 5; i++) {
      const session = await api('post', '/api/v1/attendance/sessions', adminToken, {
        batchId,
        title: `Session ${i + 1}`,
      });
      await api('post', `/api/v1/attendance/sessions/${session.id}/mark`, adminToken, {
        records: [{ studentId, status: 'ABSENT' }],
      });
    }
    // ...plus an all-wrong quiz (low performance + low skill mastery) pushes
    // risk into HIGH/CRITICAL, which fires the automated workflow.
    const assessment = await api('post', '/api/v1/assessments', adminToken, {
      batchId,
      title: `Intv Quiz ${Date.now()}`,
      questions: [
        { type: 'MCQ', prompt: 'Q1', topic: 'Pandas', options: [{ text: 'right', isCorrect: true }, { text: 'wrong', isCorrect: false }] },
        { type: 'MCQ', prompt: 'Q2', topic: 'SQL', options: [{ text: 'right', isCorrect: true }, { text: 'wrong', isCorrect: false }] },
      ],
    });
    await api('post', `/api/v1/assessments/${assessment.id}/publish`, adminToken);
    const started = await api('post', `/api/v1/assessments/${assessment.id}/attempts`, studentToken);
    const answers = started.questions.map((q: { id: string; options: { id: string; text: string }[] }) => ({
      questionId: q.id,
      selectedOptionIds: [q.options.find((o) => o.text === 'wrong')!.id],
    }));
    await api('post', `/api/v1/assessments/attempts/${started.attemptId}/submit`, studentToken, { answers });

    // The student now has an active intervention with a validated plan.
    const mine = await api('get', '/api/v1/me/interventions', studentToken);
    expect(mine.active).toBeTruthy();
    expect(['HIGH', 'CRITICAL']).toContain(mine.active.riskLevel);
    expect(mine.active.status).toBe('PLAN_READY');
    expect(mine.active.plan).toBeTruthy();
    expect(mine.active.plan.provider).toBe('heuristic');
    expect(mine.active.plan.tasks.length).toBeGreaterThanOrEqual(2);
    expect(mine.active.followUpAt).toBeTruthy();

    interventionId = mine.active.id;
    taskIds = mine.active.plan.tasks.map((t: { id: string }) => t.id);
  });

  it('never duplicates an active intervention on re-evaluation (§37)', async () => {
    await api('post', `/api/v1/students/${studentId}/risk/evaluate`, adminToken);
    await api('post', `/api/v1/students/${studentId}/risk/evaluate`, adminToken);
    const all = await api('get', `/api/v1/students/${studentId}/interventions`, adminToken);
    const active = (all as Array<{ status: string }>).filter((i) =>
      ['OPEN', 'PLAN_READY', 'IN_PROGRESS'].includes(i.status),
    );
    expect(active).toHaveLength(1);
  });

  it('tracks task completion and recalculates on the final task', async () => {
    const first = await api('post', `/api/v1/me/recovery-tasks/${taskIds[0]}/complete`, studentToken);
    expect(first.interventionStatus).toBe('IN_PROGRESS');

    let last: { allTasksCompleted: boolean; interventionStatus: string; riskLevel: string | null } = first;
    for (const id of taskIds.slice(1)) {
      last = await api('post', `/api/v1/me/recovery-tasks/${id}/complete`, studentToken);
    }
    expect(last.allTasksCompleted).toBe(true);
    // The underlying signals (absences, failed quiz) haven't improved, so the
    // recalculated risk stays elevated and the intervention stays open.
    expect(last.riskLevel).toBeTruthy();
    expect(last.interventionStatus).toBe('IN_PROGRESS');
  });

  it('lets staff resolve the intervention; students cannot use staff endpoints', async () => {
    const resolved = await api('post', `/api/v1/interventions/${interventionId}/resolve`, adminToken);
    expect(resolved.status).toBe('RESOLVED');

    await request(app.getHttpServer())
      .post(`/api/v1/interventions/${interventionId}/generate-plan`)
      .set(auth(studentToken))
      .expect(403);
  });
});
