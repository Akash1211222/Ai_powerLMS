/**
 * Career profile + resume e2e (§25). Runs live in CI. Verifies:
 *   - a profile is lazily created and updatable by its owner
 *   - projects + experiences CRUD, scoped to the owner
 *   - the assembled resume joins profile + top skills + placement readiness
 *   - visibility + tenant scoping on the staff/officer drill-down.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaClient } from '@fca/database';

const TEST_DB = process.env.TEST_DATABASE_URL;
const run = TEST_DB ? describe : describe.skip;

run('Career profile (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let studentId: string;
  let adminToken: string;
  let studentToken: string;

  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB;
    prisma = new PrismaClient({ datasourceUrl: TEST_DB });
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

    await prisma.careerProfile.deleteMany({ where: { userId: studentId } });
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.careerProfile.deleteMany({ where: { userId: studentId } }).catch(() => undefined);
      await prisma.$disconnect();
    }
    if (app) await app.close();
  });

  async function login(email: string): Promise<string> {
    const res = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email, password: 'Password123!' }).expect(200);
    return res.body.accessToken as string;
  }
  async function api(method: 'post' | 'get' | 'put' | 'patch' | 'delete', path: string, token: string, body?: unknown) {
    const r = request(app.getHttpServer())[method](path).set(auth(token));
    const res = await (body ? r.send(body) : r);
    if (res.status >= 400) throw new Error(`${method} ${path} -> ${res.status}: ${res.text}`);
    return res.body;
  }

  it('lazily creates the profile and updates its fields', async () => {
    const created = await api('get', '/api/v1/me/career-profile', studentToken);
    expect(created.userId).toBe(studentId);
    expect(created.visibility).toBe('PLACEMENT');
    expect(created.projects).toEqual([]);

    const updated = await api('put', '/api/v1/me/career-profile', studentToken, {
      headline: 'Aspiring Data Analyst',
      summary: 'Detail-oriented and curious.',
      linkedinUrl: 'https://linkedin.com/in/sam',
      openToWork: true,
    });
    expect(updated.headline).toBe('Aspiring Data Analyst');
    expect(updated.linkedinUrl).toBe('https://linkedin.com/in/sam');
  });

  it('manages projects and experiences owned by the student', async () => {
    const project = await api('post', '/api/v1/me/career-profile/projects', studentToken, {
      title: 'Sales Dashboard',
      description: 'Built an ETL + dashboard.',
      skills: ['SQL', 'Pandas'],
    });
    expect(project.title).toBe('Sales Dashboard');

    const exp = await api('post', '/api/v1/me/career-profile/experiences', studentToken, {
      kind: 'EDUCATION',
      title: 'B.Sc Computer Science',
      organization: 'State University',
      startDate: '2021-08-01',
      current: true,
    });
    expect(exp.current).toBe(true);
    expect(exp.endDate).toBeNull();

    const profile = await api('get', '/api/v1/me/career-profile', studentToken);
    expect(profile.projects).toHaveLength(1);
    expect(profile.experiences).toHaveLength(1);

    await api('delete', `/api/v1/me/career-profile/projects/${project.id}`, studentToken);
    const after = await api('get', '/api/v1/me/career-profile', studentToken);
    expect(after.projects).toHaveLength(0);
  });

  it('validates input (rejects a bad URL and too-short titles)', async () => {
    await request(app.getHttpServer())
      .put('/api/v1/me/career-profile')
      .set(auth(studentToken))
      .send({ linkedinUrl: 'not-a-url' })
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/v1/me/career-profile/projects')
      .set(auth(studentToken))
      .send({ title: 'x' })
      .expect(400);
  });

  it('assembles a resume joining profile, skills and placement readiness', async () => {
    const resume = await api('get', '/api/v1/me/career-profile/resume', studentToken);
    expect(resume.identity.name).toBeTruthy();
    expect(resume.profile.headline).toBe('Aspiring Data Analyst');
    expect(Array.isArray(resume.topSkills)).toBe(true);
    expect(resume.readiness).toHaveProperty('readinessScore');
    expect(resume.readiness).toHaveProperty('tier');
  });

  it('exposes a PLACEMENT profile to staff but hides a PRIVATE one', async () => {
    const staffView = await api('get', `/api/v1/students/${studentId}/career-profile`, adminToken);
    expect(staffView.profile.userId).toBe(studentId);

    // Make it private → staff can no longer see it.
    await api('put', '/api/v1/me/career-profile', studentToken, { visibility: 'PRIVATE' });
    await request(app.getHttpServer())
      .get(`/api/v1/students/${studentId}/career-profile`)
      .set(auth(adminToken))
      .expect(404);

    // Students cannot use the staff-scoped endpoint at all.
    await request(app.getHttpServer())
      .get(`/api/v1/students/${studentId}/career-profile`)
      .set(auth(studentToken))
      .expect(403);
  });
});
