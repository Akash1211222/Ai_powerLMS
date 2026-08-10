/**
 * Course + Batch + Enrollment HTTP e2e (§41). Runs live in CI against seeded
 * Postgres. Covers the M1.1 journey and its authorization:
 *   admin: create course -> module -> lesson -> publish; create batch ->
 *          add student (enrolls them)
 *   student: sees the enrollment via /me/enrollments; CANNOT create a course
 *   publish without a lesson -> 400
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaClient } from '@fca/database';

const TEST_DB = process.env.TEST_DATABASE_URL;
const run = TEST_DB ? describe : describe.skip;

run('Courses + Batches (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let orgId: string;
  let adminToken: string;
  let studentToken: string;
  const created: { courseIds: string[]; batchIds: string[] } = { courseIds: [], batchIds: [] };

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB;
    prisma = new PrismaClient({ datasourceUrl: TEST_DB });
    const org = await prisma.organization.findUniqueOrThrow({ where: { slug: 'futurecorp-demo' } });
    orgId = org.id;

    const { AppModule } = await import('../src/app.module');
    const { AllExceptionsFilter } = await import('../src/common/filters/all-exceptions.filter');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1', { exclude: ['health', 'health/ready'] });
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();

    adminToken = await login('superadmin@futurecorpacademy.in');
    studentToken = await login('student@futurecorpacademy.in');
  });

  afterAll(async () => {
    if (prisma) {
      // Clean up created data (batches first due to FK from enrollments).
      for (const id of created.batchIds) {
        await prisma.enrollment.deleteMany({ where: { batchId: id } }).catch(() => undefined);
        await prisma.batch.delete({ where: { id } }).catch(() => undefined);
      }
      for (const id of created.courseIds) {
        await prisma.enrollment.deleteMany({ where: { courseId: id } }).catch(() => undefined);
        await prisma.course.delete({ where: { id } }).catch(() => undefined);
      }
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

  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  it('admin can author and publish a course, then enroll a student via a batch', async () => {
    // Create course
    const courseRes = await request(app.getHttpServer())
      .post('/api/v1/courses')
      .set(auth(adminToken))
      .send({ organizationId: orgId, title: `E2E Data Analytics ${Date.now()}` })
      .expect(201);
    const courseId = courseRes.body.id as string;
    created.courseIds.push(courseId);
    expect(courseRes.body.status).toBe('DRAFT');

    // Add module + lesson
    const moduleRes = await request(app.getHttpServer())
      .post(`/api/v1/courses/${courseId}/modules`)
      .set(auth(adminToken))
      .send({ title: 'Pandas' })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/v1/courses/modules/${moduleRes.body.id}/lessons`)
      .set(auth(adminToken))
      .send({ title: 'DataFrames', type: 'VIDEO' })
      .expect(201);

    // Publish
    const pub = await request(app.getHttpServer())
      .post(`/api/v1/courses/${courseId}/publish`)
      .set(auth(adminToken))
      .expect(201);
    expect(pub.body.status).toBe('PUBLISHED');

    // Create batch + add student
    const batchRes = await request(app.getHttpServer())
      .post('/api/v1/batches')
      .set(auth(adminToken))
      .send({ organizationId: orgId, courseId, name: `E2E Batch ${Date.now()}` })
      .expect(201);
    const batchId = batchRes.body.id as string;
    created.batchIds.push(batchId);

    // Add the student by EMAIL (exercises the resolve-by-email path).
    await request(app.getHttpServer())
      .post(`/api/v1/batches/${batchId}/students`)
      .set(auth(adminToken))
      .send({ email: 'student@futurecorpacademy.in' })
      .expect(201);

    // Student sees the enrollment
    const enrollRes = await request(app.getHttpServer())
      .get('/api/v1/me/enrollments')
      .set(auth(studentToken))
      .expect(200);
    const match = (enrollRes.body as Array<{ course: { id: string }; progress: unknown }>).find(
      (e) => e.course.id === courseId,
    );
    expect(match).toBeTruthy();
    expect(match?.progress).toBeTruthy();
  });

  it('hides course content from a student who is not enrolled, and reveals it once they are', async () => {
    // A published course the student is deliberately never added to.
    const course = await request(app.getHttpServer())
      .post('/api/v1/courses')
      .set(auth(adminToken))
      .send({ organizationId: orgId, title: `E2E Locked Course ${Date.now()}` })
      .expect(201);
    const courseId = course.body.id as string;
    created.courseIds.push(courseId);

    const mod = await request(app.getHttpServer())
      .post(`/api/v1/courses/${courseId}/modules`)
      .set(auth(adminToken))
      .send({ title: 'Secret module' })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/v1/courses/modules/${mod.body.id}/lessons`)
      .set(auth(adminToken))
      .send({ title: 'Secret lesson', type: 'VIDEO' })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/v1/courses/${courseId}/publish`)
      .set(auth(adminToken))
      .expect(201);

    // Belonging to the college is not enrolment: the card is visible so the
    // student can ask to be added, but no module or lesson title leaks.
    const locked = await request(app.getHttpServer())
      .get(`/api/v1/courses/${courseId}`)
      .set(auth(studentToken))
      .expect(200);
    expect(locked.body.locked).toBe(true);
    expect(locked.body.enrolled).toBe(false);
    expect(locked.body.modules).toEqual([]);
    expect(JSON.stringify(locked.body)).not.toContain('Secret lesson');
    expect(JSON.stringify(locked.body)).not.toContain('Secret module');
    // Counts still advertise the shape of the course.
    expect(locked.body.contentCounts).toEqual({ modules: 1, lessons: 1 });

    // Staff are not gated by enrolment — they run the course.
    const staffView = await request(app.getHttpServer())
      .get(`/api/v1/courses/${courseId}`)
      .set(auth(adminToken))
      .expect(200);
    expect(staffView.body.locked).toBe(false);
    expect(staffView.body.modules).toHaveLength(1);

    // Enrol the student through a batch, exactly as a course manager would.
    const batch = await request(app.getHttpServer())
      .post('/api/v1/batches')
      .set(auth(adminToken))
      .send({ organizationId: orgId, courseId, name: `E2E Unlock Batch ${Date.now()}` })
      .expect(201);
    created.batchIds.push(batch.body.id as string);
    await request(app.getHttpServer())
      .post(`/api/v1/batches/${batch.body.id}/students`)
      .set(auth(adminToken))
      .send({ email: 'student@futurecorpacademy.in' })
      .expect(201);

    const unlocked = await request(app.getHttpServer())
      .get(`/api/v1/courses/${courseId}`)
      .set(auth(studentToken))
      .expect(200);
    expect(unlocked.body.locked).toBe(false);
    expect(unlocked.body.enrolled).toBe(true);
    expect(unlocked.body.modules[0].lessons[0].title).toBe('Secret lesson');
  });

  it('keeps unpublished courses out of the student catalogue, even if asked for by status', async () => {
    const draft = await request(app.getHttpServer())
      .post('/api/v1/courses')
      .set(auth(adminToken))
      .send({ organizationId: orgId, title: `E2E Draft Course ${Date.now()}` })
      .expect(201);
    created.courseIds.push(draft.body.id as string);

    const ids = async (token: string, qs = '') =>
      (
        await request(app.getHttpServer())
          .get(`/api/v1/courses?organizationId=${orgId}&pageSize=100${qs}`)
          .set(auth(token))
          .expect(200)
      ).body.data.map((c: { id: string }) => c.id);

    // Staff work from the full list, including their own drafts.
    expect(await ids(adminToken)).toContain(draft.body.id);
    // Students see what is running.
    expect(await ids(studentToken)).not.toContain(draft.body.id);
    // ...and cannot ask for drafts directly to get around that.
    expect(await ids(studentToken, '&status=DRAFT')).not.toContain(draft.body.id);
  });

  it('returns the org via /me/organizations for the admin', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/me/organizations')
      .set(auth(adminToken))
      .expect(200);
    expect((res.body as Array<{ id: string }>).some((o) => o.id === orgId)).toBe(true);
  });

  it('forbids a student from creating a course (403)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/courses')
      .set(auth(studentToken))
      .send({ organizationId: orgId, title: 'Nope' })
      .expect(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('refuses to publish a course with no lessons (400)', async () => {
    const courseRes = await request(app.getHttpServer())
      .post('/api/v1/courses')
      .set(auth(adminToken))
      .send({ organizationId: orgId, title: `Empty Course ${Date.now()}` })
      .expect(201);
    created.courseIds.push(courseRes.body.id);
    await request(app.getHttpServer())
      .post(`/api/v1/courses/${courseRes.body.id}/publish`)
      .set(auth(adminToken))
      .expect(400);
  });
});
