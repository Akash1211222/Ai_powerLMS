/**
 * Applications pipeline e2e (§27). Runs live in CI. Verifies:
 *   - a student applies to an eligible OPEN opportunity (readiness-gated),
 *     duplicate applications are rejected, and the discovery feed reflects it
 *   - a reviewer advances the application through stages; the student sees it
 *   - the readiness gate blocks applying to a high-bar role
 *   - permission scoping (students can't set status) + terminal immutability.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaClient } from '@fca/database';

const TEST_DB = process.env.TEST_DATABASE_URL;
const run = TEST_DB ? describe : describe.skip;

run('Applications pipeline (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let orgId: string;
  let studentId: string;
  let adminToken: string;
  let studentToken: string;
  const opps: string[] = [];
  let openOppId = '';
  let applicationId = '';

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

    const opp = await api('post', '/api/v1/opportunities', adminToken, {
      organizationId: orgId,
      title: `Analyst Role ${Date.now()}`,
      companyName: 'DataWorks',
      description: 'Open to all learners in the program.',
      requirements: ['Python'],
      minReadiness: null,
    });
    openOppId = opp.id;
    opps.push(opp.id);
    await api('post', `/api/v1/opportunities/${openOppId}/publish`, adminToken);
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.application.deleteMany({ where: { studentId } }).catch(() => undefined);
      for (const id of opps) await prisma.opportunity.delete({ where: { id } }).catch(() => undefined);
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

  it('lets an eligible student apply, records a snapshot, and rejects duplicates', async () => {
    const application = await api('post', `/api/v1/me/opportunities/${openOppId}/apply`, studentToken, {
      coverNote: 'Keen to join and grow.',
    });
    expect(application.status).toBe('APPLIED');
    expect(typeof application.readinessSnapshot).toBe('number');
    applicationId = application.id;

    // Duplicate application → 409.
    await request(app.getHttpServer())
      .post(`/api/v1/me/opportunities/${openOppId}/apply`)
      .set(auth(studentToken))
      .send({})
      .expect(409);

    // The discovery feed now shows the application status.
    const feed = await api('get', '/api/v1/me/opportunities', studentToken);
    const mine = (feed as Array<{ id: string; applicationStatus: string | null }>).find((o) => o.id === openOppId);
    expect(mine?.applicationStatus).toBe('APPLIED');

    // And it appears in the student's applications list.
    const list = await api('get', '/api/v1/me/applications', studentToken);
    expect((list as Array<{ id: string }>).some((a) => a.id === applicationId)).toBe(true);
  });

  it('lets a reviewer advance the application and notifies the student', async () => {
    const staffList = await api('get', `/api/v1/opportunities/${openOppId}/applications`, adminToken);
    expect((staffList as Array<{ id: string }>).some((a) => a.id === applicationId)).toBe(true);

    const shortlisted = await api('patch', `/api/v1/applications/${applicationId}/status`, adminToken, {
      status: 'SHORTLISTED',
      decisionNote: 'Strong fit.',
    });
    expect(shortlisted.status).toBe('SHORTLISTED');
    expect(shortlisted.reviewedById).toBeTruthy();

    const list = await api('get', '/api/v1/me/applications', studentToken);
    const mine = (list as Array<{ id: string; status: string }>).find((a) => a.id === applicationId);
    expect(mine?.status).toBe('SHORTLISTED');
  });

  it('blocks applying to a role above the readiness gate', async () => {
    const hard = await api('post', '/api/v1/opportunities', adminToken, {
      organizationId: orgId,
      title: `Senior ${Date.now()}`,
      companyName: 'Peak',
      description: 'High readiness required.',
      minReadiness: 99,
    });
    opps.push(hard.id);
    await api('post', `/api/v1/opportunities/${hard.id}/publish`, adminToken);

    await request(app.getHttpServer())
      .post(`/api/v1/me/opportunities/${hard.id}/apply`)
      .set(auth(studentToken))
      .send({})
      .expect(400);
  });

  it('enforces permissions and terminal immutability', async () => {
    // Students cannot set application status.
    await request(app.getHttpServer())
      .patch(`/api/v1/applications/${applicationId}/status`)
      .set(auth(studentToken))
      .send({ status: 'HIRED' })
      .expect(403);

    // Reject (terminal), then any further transition is refused.
    const rejected = await api('patch', `/api/v1/applications/${applicationId}/status`, adminToken, { status: 'REJECTED' });
    expect(rejected.status).toBe('REJECTED');
    await request(app.getHttpServer())
      .patch(`/api/v1/applications/${applicationId}/status`)
      .set(auth(adminToken))
      .send({ status: 'SHORTLISTED' })
      .expect(400);

    // The student can no longer withdraw a terminal application.
    await request(app.getHttpServer())
      .post(`/api/v1/me/applications/${applicationId}/withdraw`)
      .set(auth(studentToken))
      .expect(400);
  });
});
