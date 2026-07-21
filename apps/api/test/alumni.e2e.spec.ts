/**
 * Alumni network e2e (§29). Runs live in CI. Verifies:
 *   - an alumnus fills in where they landed; the profile is created lazily
 *   - published alumni appear in the org-scoped directory to current students
 *   - unpublishing removes them from the directory (opt-out is honoured)
 *   - the outcomes rollup tallies companies/industries deterministically.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaClient } from '@fca/database';

const TEST_DB = process.env.TEST_DATABASE_URL;
const run = TEST_DB ? describe : describe.skip;

run('Alumni network (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let orgId: string;
  let alumniId: string;
  let studentId: string;
  let alumniToken: string;
  let studentToken: string;

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

    alumniToken = await login('alumni@futurecorpacademy.in');
    studentToken = await login('student@futurecorpacademy.in');

    // Both must share an org for the directory to surface the alumnus.
    for (const userId of [alumniId, studentId]) {
      await prisma.organizationMember.upsert({
        where: { organizationId_userId: { organizationId: orgId, userId } },
        update: {},
        create: { organizationId: orgId, userId },
      });
    }
    await prisma.alumniProfile.deleteMany({ where: { userId: { in: [alumniId, studentId] } } });
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.alumniProfile
        .deleteMany({ where: { userId: { in: [alumniId, studentId] } } })
        .catch(() => undefined);
      await prisma.$disconnect();
    }
    if (app) await app.close();
  });

  async function login(email: string): Promise<string> {
    const res = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email, password: 'Password123!' }).expect(200);
    return res.body.accessToken as string;
  }
  async function api(method: 'get' | 'put', path: string, token: string, body?: unknown) {
    const r = request(app.getHttpServer())[method](path).set(auth(token));
    const res = await (body ? r.send(body) : r);
    if (res.status >= 400) throw new Error(`${method} ${path} -> ${res.status}: ${res.text}`);
    return res.body;
  }

  it('lazily creates the alumni profile and records where they landed', async () => {
    const created = await api('get', '/api/v1/me/alumni-profile', alumniToken);
    expect(created.userId).toBe(alumniId);
    expect(created.isPublished).toBe(true);

    const updated = await api('put', '/api/v1/me/alumni-profile', alumniToken, {
      graduationYear: 2024,
      currentCompany: 'Acme Analytics',
      currentRole: 'Data Analyst',
      industry: 'Technology',
      location: 'Bengaluru',
      story: 'Practising SQL daily is what got me through interviews.',
      openToMentoring: true,
    });
    expect(updated.currentCompany).toBe('Acme Analytics');
    expect(updated.openToMentoring).toBe(true);
  });

  it('surfaces published alumni to current students with their story', async () => {
    const directory = await api('get', '/api/v1/alumni', studentToken);
    const entry = (directory as Array<{ userId: string; currentCompany: string; story: string; openToMentoring: boolean }>).find(
      (a) => a.userId === alumniId,
    );
    expect(entry).toBeTruthy();
    expect(entry!.currentCompany).toBe('Acme Analytics');
    expect(entry!.story).toContain('SQL');
    expect(entry!.openToMentoring).toBe(true);
  });

  it('does not publish an empty profile just because it was opened', async () => {
    // The student merely views their own profile — it must not appear as a
    // ghost entry in the directory until they actually share something.
    const own = await api('get', '/api/v1/me/alumni-profile', studentToken);
    expect(own.userId).toBe(studentId);

    const directory = await api('get', '/api/v1/alumni', studentToken);
    expect((directory as Array<{ userId: string }>).some((a) => a.userId === studentId)).toBe(false);
  });

  it('tallies outcomes deterministically', async () => {
    const outcomes = await api('get', '/api/v1/alumni/outcomes', studentToken);
    expect(outcomes.totalAlumni).toBeGreaterThanOrEqual(1);
    expect(outcomes.openToMentoring).toBeGreaterThanOrEqual(1);
    const acme = (outcomes.topCompanies as Array<{ company: string; count: number }>).find(
      (c) => c.company === 'Acme Analytics',
    );
    expect(acme?.count).toBeGreaterThanOrEqual(1);
    expect((outcomes.topIndustries as Array<{ industry: string }>).some((i) => i.industry === 'Technology')).toBe(true);
  });

  it('honours opt-out: unpublishing removes the alumnus from the directory', async () => {
    await api('put', '/api/v1/me/alumni-profile', alumniToken, { isPublished: false });
    const directory = await api('get', '/api/v1/alumni', studentToken);
    expect((directory as Array<{ userId: string }>).some((a) => a.userId === alumniId)).toBe(false);

    // …and out of the outcomes rollup too.
    const outcomes = await api('get', '/api/v1/alumni/outcomes', studentToken);
    expect((outcomes.topCompanies as Array<{ company: string }>).some((c) => c.company === 'Acme Analytics')).toBe(false);
  });
});
