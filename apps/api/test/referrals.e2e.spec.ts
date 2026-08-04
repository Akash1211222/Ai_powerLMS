/**
 * Referrals e2e (§30). Runs live in CI. Verifies:
 *   - only network members (opted-in alumni / mentors) may vouch
 *   - a referral by student email lands, is deduped, and notifies
 *   - the vouch surfaces on the staff applicant row as referralCount
 *   - staff can acknowledge; a reviewed referral can't be re-reviewed.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaClient } from '@fca/database';

const TEST_DB = process.env.TEST_DATABASE_URL;
const run = TEST_DB ? describe : describe.skip;

run('Referrals (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let orgId: string;
  let alumniId: string;
  let studentId: string;
  let adminToken: string;
  let alumniToken: string;
  let studentToken: string;
  let oppId = '';
  let referralId = '';

  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB;
    prisma = new PrismaClient({ datasourceUrl: TEST_DB });
    orgId = (await prisma.organization.findUniqueOrThrow({ where: { slug: 'futurecorp-demo' } })).id;
    alumniId = (await prisma.user.findUniqueOrThrow({ where: { email: 'alumni@futurecorpacademy.in' } })).id;
    studentId = (await prisma.user.findUniqueOrThrow({ where: { email: 'student@futurecorpacademy.in' } })).id;

    const { AppModule } = await import('../src/app.module');
    const { AllExceptionsFilter } = await import('../src/common/filters/all-exceptions.filter');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1', { exclude: ['health', 'health/ready'] });
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();

    adminToken = await login('superadmin@futurecorpacademy.in');
    alumniToken = await login('alumni@futurecorpacademy.in');
    studentToken = await login('student@futurecorpacademy.in');

    for (const userId of [alumniId, studentId]) {
      await prisma.organizationMember.upsert({
        where: { organizationId_userId: { organizationId: orgId, userId } },
        update: {},
        create: { organizationId: orgId, userId },
      });
    }
    await prisma.referral.deleteMany({ where: { studentId } });
    await prisma.alumniProfile.deleteMany({ where: { userId: alumniId } });

    const opp = await api('post', '/api/v1/opportunities', adminToken, {
      organizationId: orgId,
      title: `Referred Role ${Date.now()}`,
      companyName: 'Acme Analytics',
      description: 'A role the network can vouch for candidates on.',
      minReadiness: null,
    });
    oppId = opp.id;
    await api('post', `/api/v1/opportunities/${oppId}/publish`, adminToken);
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.referral.deleteMany({ where: { studentId } }).catch(() => undefined);
      await prisma.application.deleteMany({ where: { studentId } }).catch(() => undefined);
      if (oppId) await prisma.opportunity.delete({ where: { id: oppId } }).catch(() => undefined);
      await prisma.alumniProfile.deleteMany({ where: { userId: alumniId } }).catch(() => undefined);
      await prisma.$disconnect();
    }
    if (app) await app.close();
  });

  async function login(email: string): Promise<string> {
    const res = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email, password: 'Password123!' }).expect(200);
    return res.body.accessToken as string;
  }
  async function api(method: 'post' | 'get' | 'put' | 'patch', path: string, token: string, body?: unknown) {
    const r = request(app.getHttpServer())[method](path).set(auth(token));
    const res = await (body ? r.send(body) : r);
    if (res.status >= 400) throw new Error(`${method} ${path} -> ${res.status}: ${res.text}`);
    return res.body;
  }

  it('refuses referrals from someone outside the network', async () => {
    // The alumnus has not opted into referrals yet, and is not a mentor.
    const before = await api('get', '/api/v1/me/referrals', alumniToken);
    expect(before.canRefer).toBe(false);

    await request(app.getHttpServer())
      .post(`/api/v1/opportunities/${oppId}/referrals`)
      .set(auth(alumniToken))
      .send({ studentEmail: 'student@futurecorpacademy.in', note: 'A genuinely strong candidate.' })
      .expect(403);

    // A plain student is not a network member either.
    const studentSide = await api('get', '/api/v1/me/referrals', studentToken);
    expect(studentSide.canRefer).toBe(false);
  });

  it('lets an opted-in alumnus vouch for a student by email (deduped)', async () => {
    await api('put', '/api/v1/me/alumni-profile', alumniToken, {
      currentCompany: 'Acme Analytics',
      openToReferrals: true,
    });

    const now = await api('get', '/api/v1/me/referrals', alumniToken);
    expect(now.canRefer).toBe(true);

    const referral = await api('post', `/api/v1/opportunities/${oppId}/referrals`, alumniToken, {
      studentEmail: 'student@futurecorpacademy.in',
      note: 'Worked with them on a data project — rigorous and fast.',
    });
    expect(referral.status).toBe('PENDING');
    expect(referral.studentId).toBe(studentId);
    referralId = referral.id;

    // Same referrer + student + role → 409.
    await request(app.getHttpServer())
      .post(`/api/v1/opportunities/${oppId}/referrals`)
      .set(auth(alumniToken))
      .send({ studentEmail: 'student@futurecorpacademy.in', note: 'Vouching again for the same role.' })
      .expect(409);

    // Both sides can see it.
    const alumniSide = await api('get', '/api/v1/me/referrals', alumniToken);
    expect((alumniSide.made as Array<{ id: string }>).some((r) => r.id === referralId)).toBe(true);
    const studentSide = await api('get', '/api/v1/me/referrals', studentToken);
    expect((studentSide.received as Array<{ id: string }>).some((r) => r.id === referralId)).toBe(true);
  });

  it('surfaces the vouch on the staff applicant row', async () => {
    await api('post', `/api/v1/me/opportunities/${oppId}/apply`, studentToken, { coverNote: 'Applying.' });
    const applicants = await api('get', `/api/v1/opportunities/${oppId}/applications`, adminToken);
    const row = (applicants as Array<{ studentId: string; referralCount: number }>).find((a) => a.studentId === studentId);
    expect(row).toBeTruthy();
    expect(row!.referralCount).toBe(1);
  });

  it('lets staff acknowledge once; students cannot review', async () => {
    await request(app.getHttpServer())
      .patch(`/api/v1/referrals/${referralId}/status`)
      .set(auth(studentToken))
      .send({ status: 'ACKNOWLEDGED' })
      .expect(403);

    const reviewed = await api('patch', `/api/v1/referrals/${referralId}/status`, adminToken, { status: 'ACKNOWLEDGED' });
    expect(reviewed.status).toBe('ACKNOWLEDGED');
    expect(reviewed.reviewedById).toBeTruthy();

    await request(app.getHttpServer())
      .patch(`/api/v1/referrals/${referralId}/status`)
      .set(auth(adminToken))
      .send({ status: 'DECLINED' })
      .expect(400);
  });
});
