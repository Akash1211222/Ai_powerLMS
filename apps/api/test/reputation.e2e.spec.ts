/**
 * Reputation e2e (§32). Runs live in CI. Verifies:
 *   - a member with no activity scores zero and holds no badges
 *   - answering earns points and the FIRST_ANSWER badge, announced once
 *   - an accepted answer adds points and PROBLEM_SOLVER; awarding is idempotent
 *   - the leaderboard ranks contributors and excludes zero-score members.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaClient } from '@fca/database';

const TEST_DB = process.env.TEST_DATABASE_URL;
const run = TEST_DB ? describe : describe.skip;

run('Reputation (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let orgId: string;
  let studentId: string;
  let trainerId: string;
  let studentToken: string;
  let trainerToken: string;
  let questionId = '';
  let answerId = '';

  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB;
    prisma = new PrismaClient({ datasourceUrl: TEST_DB });
    orgId = (await prisma.organization.findUniqueOrThrow({ where: { slug: 'futurecorp-demo' } })).id;
    studentId = (await prisma.user.findUniqueOrThrow({ where: { email: 'student@futurecorpacademy.in' } })).id;
    trainerId = (await prisma.user.findUniqueOrThrow({ where: { email: 'trainer@futurecorpacademy.in' } })).id;

    const { AppModule } = await import('../src/app.module');
    const { AllExceptionsFilter } = await import('../src/common/filters/all-exceptions.filter');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1', { exclude: ['health', 'health/ready'] });
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();

    studentToken = await login('student@futurecorpacademy.in');
    trainerToken = await login('trainer@futurecorpacademy.in');

    for (const userId of [studentId, trainerId]) {
      await prisma.organizationMember.upsert({
        where: { organizationId_userId: { organizationId: orgId, userId } },
        update: {},
        create: { organizationId: orgId, userId },
      });
    }
    // Deterministic baseline for both members.
    await prisma.communityQuestion.deleteMany({ where: { authorId: { in: [studentId, trainerId] } } });
    await prisma.achievement.deleteMany({ where: { userId: { in: [studentId, trainerId] } } });
    await prisma.notification.deleteMany({ where: { userId: trainerId, type: 'ACHIEVEMENT' } });
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.communityQuestion.deleteMany({ where: { authorId: { in: [studentId, trainerId] } } }).catch(() => undefined);
      await prisma.achievement.deleteMany({ where: { userId: { in: [studentId, trainerId] } } }).catch(() => undefined);
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

  it('starts a contributor at zero with no badges', async () => {
    const rep = await api('get', '/api/v1/me/reputation', trainerToken);
    expect(rep.score).toBe(0);
    expect(rep.badges).toEqual([]);
    expect(rep.breakdown).toHaveLength(6);
  });

  it('awards points and FIRST_ANSWER for answering, announced once', async () => {
    const q = await api('post', '/api/v1/community/questions', studentToken, {
      title: 'What is the difference between WHERE and HAVING?',
      body: 'I understand both filter rows, but I never remember which one runs before the aggregate.',
      tags: ['sql'],
    });
    questionId = q.id;

    const a = await api('post', `/api/v1/community/questions/${questionId}/answers`, trainerToken, {
      body: 'WHERE filters rows before grouping; HAVING filters the groups after aggregation.',
    });
    answerId = a.id;

    const rep = await api('get', '/api/v1/me/reputation', trainerToken);
    expect(rep.score).toBe(5); // one answer
    expect((rep.badges as Array<{ code: string }>).map((b) => b.code)).toContain('FIRST_ANSWER');
    expect(rep.newlyAwarded).toContain('FIRST_ANSWER');

    // Reading again must not re-award or re-announce.
    const again = await api('get', '/api/v1/me/reputation', trainerToken);
    expect(again.newlyAwarded).toEqual([]);
    expect((again.badges as unknown[]).length).toBe((rep.badges as unknown[]).length);

    const announcements = await prisma.notification.count({
      where: { userId: trainerId, type: 'ACHIEVEMENT' },
    });
    expect(announcements).toBe(1);
  });

  it('adds points and PROBLEM_SOLVER when the answer is accepted and upvoted', async () => {
    await api('post', `/api/v1/community/answers/${answerId}/vote`, studentToken);
    await api('post', `/api/v1/community/questions/${questionId}/accept/${answerId}`, studentToken);

    const rep = await api('get', '/api/v1/me/reputation', trainerToken);
    // 1 answer (5) + 1 accepted (15) + 1 upvote received (2) = 22
    expect(rep.score).toBe(22);
    expect(rep.counts).toMatchObject({ answers: 1, acceptedAnswers: 1, upvotesReceived: 1 });
    expect((rep.badges as Array<{ code: string }>).map((b) => b.code)).toContain('PROBLEM_SOLVER');
  });

  it('ranks contributors and omits members with no contribution', async () => {
    const board = await api('get', '/api/v1/community/leaderboard', studentToken);
    const trainerRow = (board as Array<{ userId: string; score: number }>).find((r) => r.userId === trainerId);
    expect(trainerRow?.score).toBe(22);

    // The student asked one question (1 point), so they rank below the trainer.
    const studentRow = (board as Array<{ userId: string; score: number }>).find((r) => r.userId === studentId);
    expect(studentRow?.score).toBe(1);
    expect((board as Array<{ score: number }>).every((r) => r.score > 0)).toBe(true);
    const scores = (board as Array<{ score: number }>).map((r) => r.score);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
  });
});
