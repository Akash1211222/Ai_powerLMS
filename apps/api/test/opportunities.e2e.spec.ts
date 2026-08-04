/**
 * Placement opportunities e2e (§26). Runs live in CI. Verifies:
 *   - an officer/admin creates → publishes → closes an opportunity
 *   - draft opportunities are invisible to student discovery; OPEN ones appear
 *     annotated with eligibility + skill match
 *   - the readiness gate makes a high-bar posting ineligible
 *   - management endpoints are permission-gated (students get 403).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaClient } from '@fca/database';

const TEST_DB = process.env.TEST_DATABASE_URL;
const run = TEST_DB ? describe : describe.skip;

run('Placement opportunities (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let orgId: string;
  let studentId: string;
  let adminToken: string;
  let studentToken: string;
  const created: string[] = [];

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

    // The student is a member of the demo org (via seed enrollment); ensure it.
    await prisma.organizationMember.upsert({
      where: { organizationId_userId: { organizationId: orgId, userId: studentId } },
      update: {},
      create: { organizationId: orgId, userId: studentId },
    });
  });

  afterAll(async () => {
    if (prisma) {
      for (const id of created) await prisma.opportunity.delete({ where: { id } }).catch(() => undefined);
      await prisma.$disconnect();
    }
    if (app) await app.close();
  });

  async function login(email: string): Promise<string> {
    const res = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email, password: 'Password123!' }).expect(200);
    return res.body.accessToken as string;
  }
  async function api(method: 'post' | 'get' | 'patch', path: string, token: string, body?: unknown) {
    const r = request(app.getHttpServer())[method](path).set(auth(token));
    const res = await (body ? r.send(body) : r);
    if (res.status >= 400) throw new Error(`${method} ${path} -> ${res.status}: ${res.text}`);
    return res.body;
  }

  it('lets an officer create, publish and close an opportunity', async () => {
    const draft = await api('post', '/api/v1/opportunities', adminToken, {
      organizationId: orgId,
      title: `Data Analyst ${Date.now()}`,
      companyName: 'Acme Analytics',
      description: 'Join our analytics team to build dashboards and pipelines.',
      requirements: ['SQL', 'Pandas'],
      type: 'FULL_TIME',
      workMode: 'HYBRID',
    });
    created.push(draft.id);
    expect(draft.status).toBe('DRAFT');

    // Draft is invisible to students.
    const before = await api('get', '/api/v1/me/opportunities', studentToken);
    expect((before as Array<{ id: string }>).some((o) => o.id === draft.id)).toBe(false);

    const published = await api('post', `/api/v1/opportunities/${draft.id}/publish`, adminToken);
    expect(published.status).toBe('OPEN');
    expect(published.publishedAt).toBeTruthy();

    const closed = await api('post', `/api/v1/opportunities/${draft.id}/close`, adminToken);
    expect(closed.status).toBe('CLOSED');
  });

  it('shows OPEN opportunities to students with eligibility + skill match', async () => {
    const opp = await api('post', '/api/v1/opportunities', adminToken, {
      organizationId: orgId,
      title: `Junior Dev ${Date.now()}`,
      companyName: 'BuildCo',
      description: 'Entry-level role, open to all learners.',
      requirements: ['Python', 'SQL'],
      minReadiness: null,
    });
    created.push(opp.id);
    await api('post', `/api/v1/opportunities/${opp.id}/publish`, adminToken);

    const feed = await api('get', '/api/v1/me/opportunities', studentToken);
    const mine = (feed as Array<{ id: string; match: { eligible: boolean; matchScore: number; matchedSkills: string[]; missingSkills: string[] } }>).find((o) => o.id === opp.id);
    expect(mine).toBeTruthy();
    expect(mine!.match.eligible).toBe(true); // no readiness gate
    expect(mine!.match).toHaveProperty('matchScore');
    expect(mine!.match.matchedSkills.length + mine!.match.missingSkills.length).toBe(2);

    const detail = await api('get', `/api/v1/me/opportunities/${opp.id}`, studentToken);
    expect(detail.id).toBe(opp.id);
  });

  it('marks a high-readiness-gate posting ineligible for a not-ready student', async () => {
    const opp = await api('post', '/api/v1/opportunities', adminToken, {
      organizationId: orgId,
      title: `Senior Role ${Date.now()}`,
      companyName: 'TopTier',
      description: 'Requires a high placement-readiness score.',
      requirements: ['SQL'],
      minReadiness: 95,
    });
    created.push(opp.id);
    await api('post', `/api/v1/opportunities/${opp.id}/publish`, adminToken);

    const feed = await api('get', '/api/v1/me/opportunities', studentToken);
    const mine = (feed as Array<{ id: string; match: { eligible: boolean } }>).find((o) => o.id === opp.id);
    expect(mine).toBeTruthy();
    expect(mine!.match.eligible).toBe(false);
  });

  it('gates management behind placement:manage (students forbidden)', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/opportunities')
      .set(auth(studentToken))
      .send({ organizationId: orgId, title: 'Nope', companyName: 'X', description: 'no permission here' })
      .expect(403);
  });
});
