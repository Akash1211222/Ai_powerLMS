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
