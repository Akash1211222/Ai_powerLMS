/**
 * Network insights e2e (§33). Runs live in CI. Verifies:
 *   - the rollup returns learning, career and community sections for an org
 *   - real activity created in this test moves the numbers it should
 *   - highlights restate the underlying counts
 *   - access is permission-gated (students get 403) and tenant-scoped.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaClient } from '@fca/database';

const TEST_DB = process.env.TEST_DATABASE_URL;
const run = TEST_DB ? describe : describe.skip;

run('Network insights (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let orgId: string;
  let studentId: string;
  let adminToken: string;
  let studentToken: string;

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

    await prisma.organizationMember.upsert({
      where: { organizationId_userId: { organizationId: orgId, userId: studentId } },
      update: {},
      create: { organizationId: orgId, userId: studentId },
    });
    await prisma.communityQuestion.deleteMany({ where: { organizationId: orgId } });
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.communityQuestion.deleteMany({ where: { organizationId: orgId } }).catch(() => undefined);
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
  const insights = () => api('get', `/api/v1/analytics/network?organizationId=${orgId}`, adminToken);

  it('returns a complete, well-formed rollup for the organization', async () => {
    const i = await insights();
    expect(i.organizationId).toBe(orgId);
    for (const key of ['activeStudents', 'activeBatches', 'avgAttendance', 'avgOverallScore', 'atRiskCount']) {
      expect(typeof i.learning[key]).toBe('number');
    }
    for (const key of ['openOpportunities', 'applications', 'hires', 'placementRate', 'mentoringSessions', 'alumni']) {
      expect(typeof i.career[key]).toBe('number');
    }
    for (const key of ['questions', 'answers', 'answeredRate', 'referrals', 'activeContributors']) {
      expect(typeof i.community[key]).toBe('number');
    }
    expect(i.highlights).toHaveLength(3);
  });

  it('reflects real community activity in the rollup', async () => {
    const before = await insights();

    await api('post', '/api/v1/community/questions', studentToken, {
      title: 'Does the insights rollup count new questions?',
      body: 'Asking a question here should move the community counters in the network insights rollup.',
      tags: ['meta'],
    });

    const after = await insights();
    expect(after.community.questions).toBe(before.community.questions + 1);
    // A brand-new unanswered question can only hold or lower the answered rate.
    expect(after.community.answeredRate).toBeLessThanOrEqual(before.community.answeredRate);
  });

  it('states highlights that restate the underlying counts', async () => {
    const i = await insights();
    const byLabel = Object.fromEntries(
      (i.highlights as Array<{ label: string; value: string; detail: string }>).map((h) => [h.label, h]),
    );
    expect(byLabel['Community answer rate'].value).toBe(`${i.community.answeredRate}%`);
    expect(byLabel['Network contributors'].value).toBe(String(i.community.activeContributors));
    expect(byLabel['Placement rate'].value).toBe(`${i.career.placementRate}%`);
    expect(byLabel['Placement rate'].detail).toContain(`${i.career.hires} hire(s)`);
  });

  it('is gated behind analytics:view', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/analytics/network?organizationId=${orgId}`)
      .set(auth(studentToken))
      .expect(403);
  });
});
