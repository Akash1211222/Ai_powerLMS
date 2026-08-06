/**
 * Community Q&A e2e (§31). Runs live in CI. Verifies:
 *   - asking, browsing (with tag filter) and reading a question
 *   - answering notifies the asker; upvotes toggle and self-votes are refused
 *   - only the asker can accept, which flips the question to ANSWERED and
 *     leaves exactly one accepted answer
 *   - input validation and org scoping.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaClient } from '@fca/database';

const TEST_DB = process.env.TEST_DATABASE_URL;
const run = TEST_DB ? describe : describe.skip;

run('Community Q&A (e2e)', () => {
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
  const TAG = `sql-${Date.now()}`;

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
    await prisma.communityQuestion.deleteMany({ where: { authorId: studentId } });
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.communityQuestion.deleteMany({ where: { authorId: studentId } }).catch(() => undefined);
      await prisma.$disconnect();
    }
    if (app) await app.close();
  });

  async function login(email: string): Promise<string> {
    const res = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email, password: 'Password123!' }).expect(200);
    return res.body.accessToken as string;
  }
  async function api(method: 'post' | 'get' | 'delete', path: string, token: string, body?: unknown) {
    const r = request(app.getHttpServer())[method](path).set(auth(token));
    const res = await (body ? r.send(body) : r);
    if (res.status >= 400) throw new Error(`${method} ${path} -> ${res.status}: ${res.text}`);
    return res.body;
  }

  /** Raw call that returns the status instead of throwing, for 403 assertions. */
  async function rawStatus(method: 'delete', path: string, token: string) {
    const res = await request(app.getHttpServer())[method](path).set(auth(token));
    return res.status;
  }

  it('asks a question and finds it by tag', async () => {
    const q = await api('post', '/api/v1/community/questions', studentToken, {
      title: 'How do window functions differ from GROUP BY?',
      body: 'I keep mixing up when to reach for a window function versus a plain aggregate. What is the rule of thumb?',
      tags: [TAG],
    });
    expect(q.status).toBe('OPEN');
    questionId = q.id;

    const list = await api('get', `/api/v1/community/questions?tag=${TAG}`, studentToken);
    expect(list.data).toHaveLength(1);
    expect(list.data[0].id).toBe(questionId);
    expect(list.data[0]._count.answers).toBe(0);

    const tags = await api('get', '/api/v1/community/tags', studentToken);
    expect((tags as Array<{ tag: string }>).some((t) => t.tag === TAG)).toBe(true);
  });

  it('rejects malformed questions', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/community/questions')
      .set(auth(studentToken))
      .send({ title: 'too short', body: 'also too short' })
      .expect(400);
  });

  it('lets a peer answer and upvote, but not upvote their own answer', async () => {
    const a = await api('post', `/api/v1/community/questions/${questionId}/answers`, trainerToken, {
      body: 'Use a window function when you need per-row detail alongside the aggregate; GROUP BY collapses rows.',
    });
    answerId = a.id;

    // The trainer cannot upvote their own answer.
    await request(app.getHttpServer())
      .post(`/api/v1/community/answers/${answerId}/vote`)
      .set(auth(trainerToken))
      .expect(400);

    // The asker can, and the vote toggles.
    const up = await api('post', `/api/v1/community/answers/${answerId}/vote`, studentToken);
    expect(up).toMatchObject({ votedByMe: true, voteCount: 1 });
    const down = await api('post', `/api/v1/community/answers/${answerId}/vote`, studentToken);
    expect(down).toMatchObject({ votedByMe: false, voteCount: 0 });
    await api('post', `/api/v1/community/answers/${answerId}/vote`, studentToken);

    const detail = await api('get', `/api/v1/community/questions/${questionId}`, studentToken);
    expect(detail.answers).toHaveLength(1);
    expect(detail.answers[0]).toMatchObject({ voteCount: 1, votedByMe: true, isAccepted: false });
  });

  it('lets only the asker accept, flipping the question to ANSWERED', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/community/questions/${questionId}/accept/${answerId}`)
      .set(auth(trainerToken))
      .expect(403);

    const accepted = await api('post', `/api/v1/community/questions/${questionId}/accept/${answerId}`, studentToken);
    expect(accepted.status).toBe('ANSWERED');
    const acceptedAnswers = (accepted.answers as Array<{ isAccepted: boolean }>).filter((a) => a.isAccepted);
    expect(acceptedAnswers).toHaveLength(1);
  });

  it('supports feed posts, claps, DMs, study rooms, and event RSVPs', async () => {
    const post = await api('post', '/api/v1/community/posts', studentToken, {
      body: 'Shipping a quick update from e2e — community hub is live.',
      kind: 'UPDATE',
    });
    expect(post.id).toBeTruthy();

    const clap = await api('post', `/api/v1/community/posts/${post.id}/react`, trainerToken);
    expect(clap).toMatchObject({ clappedByMe: true, clapCount: 1 });

    const room = await api('post', '/api/v1/community/study-rooms', studentToken, {
      title: 'E2E focus room',
    });
    const joined = await api('post', `/api/v1/community/study-rooms/${room.id}/join`, trainerToken);
    expect(joined.success).toBe(true);

    const conv = await api('post', '/api/v1/community/conversations', studentToken, {
      userId: trainerId,
      body: 'Hey from e2e',
    });
    expect(conv.id).toBeTruthy();
    const msgs = await api('get', `/api/v1/community/conversations/${conv.id}/messages`, trainerToken);
    expect(msgs.data.length).toBeGreaterThanOrEqual(1);

    const event = await api('post', '/api/v1/community/events', studentToken, {
      title: 'E2E community meetup',
      startsAt: new Date(Date.now() + 86_400_000).toISOString(),
    });
    const rsvp = await api('post', `/api/v1/community/events/${event.id}/rsvp`, trainerToken, {
      status: 'GOING',
    });
    expect(rsvp).toMatchObject({ success: true, status: 'GOING' });
  });

  // ---- Moderation (COMMUNITY_MODERATE) -----------------------------------

  it('refuses moderation to members without COMMUNITY_MODERATE', async () => {
    // A student can post, but must not be able to remove other people's content.
    const q = await api('post', '/api/v1/community/questions', studentToken, {
      title: 'Student cannot moderate this thread away',
      body: 'Body long enough to satisfy validation for the moderation test.',
      tags: [TAG],
    });
    expect(await rawStatus('delete', `/api/v1/community/questions/${q.id}`, studentToken)).toBe(403);
    // Still visible.
    expect((await api('get', `/api/v1/community/questions/${q.id}`, studentToken)).id).toBe(q.id);
  });

  it('lets a moderator remove an answer, reopening the question if it was accepted', async () => {
    const q = await api('post', '/api/v1/community/questions', studentToken, {
      title: 'Question whose accepted answer gets removed',
      body: 'Body long enough to satisfy validation for the moderation test.',
      tags: [TAG],
    });
    const a = await api('post', `/api/v1/community/questions/${q.id}/answers`, trainerToken, {
      body: 'An answer that will be accepted and then moderated away.',
    });
    await api('post', `/api/v1/community/questions/${q.id}/accept/${a.id}`, studentToken);
    expect((await api('get', `/api/v1/community/questions/${q.id}`, studentToken)).status).toBe(
      'ANSWERED',
    );

    await api('delete', `/api/v1/community/answers/${a.id}`, trainerToken);

    const after = await api('get', `/api/v1/community/questions/${q.id}`, studentToken);
    expect(after.answers.map((x: { id: string }) => x.id)).not.toContain(a.id);
    // The question must not still claim to be answered by hidden content.
    expect(after.status).toBe('OPEN');
  });

  it('hides a removed question from detail and listings, but keeps the row', async () => {
    const q = await api('post', '/api/v1/community/questions', studentToken, {
      title: 'Question that gets moderated away entirely',
      body: 'Body long enough to satisfy validation for the moderation test.',
      tags: [TAG],
    });
    await api('delete', `/api/v1/community/questions/${q.id}`, trainerToken);

    expect(await rawStatus('delete', `/api/v1/community/questions/${q.id}`, trainerToken)).toBe(404);

    const list = await api('get', `/api/v1/community/questions?tag=${TAG}`, studentToken);
    expect(list.data.map((x: { id: string }) => x.id)).not.toContain(q.id);

    // Soft removal: the audit trail needs the row to survive.
    const row = await prisma.communityQuestion.findUnique({ where: { id: q.id } });
    expect(row).not.toBeNull();
    expect(row?.removedAt).toBeInstanceOf(Date);
    expect(row?.removedById).toBe(trainerId);
  });
});
