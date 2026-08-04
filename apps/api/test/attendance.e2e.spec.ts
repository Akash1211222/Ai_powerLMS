/**
 * Attendance e2e (§14). Runs live in CI. Full journey:
 *   admin: course -> lesson -> publish -> batch -> enroll isolated student
 *          -> attendance session -> mark PRESENT
 *   student: sees rate 100%, requests a correction to ABSENT
 *   admin: approves the correction -> record becomes ABSENT, rate 0%
 *   authorization: student cannot create a session (403)
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import { PrismaClient } from '@fca/database';

const TEST_DB = process.env.TEST_DATABASE_URL;
const run = TEST_DB ? describe : describe.skip;
const PASSWORD = 'Password123!';

run('Attendance (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let orgId: string;
  let adminToken: string;
  let studentToken: string;
  let studentId = '';
  let studentEmail = '';
  let courseId = '';
  let batchId = '';
  let recordId = '';

  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB;
    prisma = new PrismaClient({ datasourceUrl: TEST_DB });
    orgId = (await prisma.organization.findUniqueOrThrow({ where: { slug: 'futurecorp-demo' } })).id;

    const { AppModule } = await import('../src/app.module');
    const { AllExceptionsFilter } = await import('../src/common/filters/all-exceptions.filter');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1', { exclude: ['health', 'health/ready'] });
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();

    adminToken = await login('superadmin@futurecorpacademy.in');

    // Isolated student so seeded attendance history cannot skew rates.
    studentEmail = `attn.e2e.${Date.now()}@futurecorpacademy.in`;
    const role = await prisma.role.findUniqueOrThrow({ where: { name: 'STUDENT' } });
    const user = await prisma.user.create({
      data: {
        email: studentEmail,
        passwordHash: await argon2.hash(PASSWORD, { type: argon2.argon2id }),
        status: 'ACTIVE',
        emailVerifiedAt: new Date(0),
        profile: { create: { firstName: 'Attn', lastName: 'E2E' } },
        orgMemberships: { create: { organizationId: orgId, isPrimary: true } },
        roles: { create: { roleId: role.id, organizationId: orgId } },
      },
    });
    studentId = user.id;
    studentToken = await login(studentEmail);

    const course = await req('post', '/api/v1/courses', adminToken, {
      organizationId: orgId,
      title: `Attn Course ${Date.now()}`,
    });
    courseId = course.id;
    const mod = await req('post', `/api/v1/courses/${courseId}/modules`, adminToken, {
      title: 'M1',
    });
    await req('post', `/api/v1/courses/modules/${mod.id}/lessons`, adminToken, { title: 'L1' });
    await req('post', `/api/v1/courses/${courseId}/publish`, adminToken);
    const batch = await req('post', '/api/v1/batches', adminToken, {
      organizationId: orgId,
      courseId,
      name: `Attn Batch ${Date.now()}`,
    });
    batchId = batch.id;
    await req('post', `/api/v1/batches/${batchId}/students`, adminToken, {
      email: studentEmail,
    });
  });

  afterAll(async () => {
    if (prisma) {
      if (studentId) {
        await prisma.attendanceRecord.deleteMany({ where: { studentId } }).catch(() => undefined);
        await prisma.attendanceCorrectionRequest
          .deleteMany({ where: { requestedById: studentId } })
          .catch(() => undefined);
        await prisma.enrollment.deleteMany({ where: { userId: studentId } }).catch(() => undefined);
        await prisma.batchStudent.deleteMany({ where: { userId: studentId } }).catch(() => undefined);
        await prisma.userRole.deleteMany({ where: { userId: studentId } }).catch(() => undefined);
        await prisma.organizationMember.deleteMany({ where: { userId: studentId } }).catch(() => undefined);
        await prisma.user.delete({ where: { id: studentId } }).catch(() => undefined);
      }
      if (batchId) {
        await prisma.attendanceSession.deleteMany({ where: { batchId } }).catch(() => undefined);
        await prisma.enrollment.deleteMany({ where: { batchId } }).catch(() => undefined);
        await prisma.batch.delete({ where: { id: batchId } }).catch(() => undefined);
      }
      if (courseId) await prisma.course.delete({ where: { id: courseId } }).catch(() => undefined);
      await prisma.$disconnect();
    }
    if (app) await app.close();
  });

  async function login(email: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: PASSWORD })
      .expect(200);
    return res.body.accessToken as string;
  }
  async function req(method: 'post' | 'get', path: string, token: string, body?: unknown) {
    const r = request(app.getHttpServer())[method](path).set(auth(token));
    const res = await (body ? r.send(body) : r);
    if (res.status >= 400) throw new Error(`${method} ${path} -> ${res.status}: ${res.text}`);
    return res.body;
  }

  it('marks a student present and reflects a 100% rate', async () => {
    const session = await req('post', '/api/v1/attendance/sessions', adminToken, {
      batchId,
      title: 'Day 1',
    });
    await req('post', `/api/v1/attendance/sessions/${session.id}/mark`, adminToken, {
      records: [{ studentId, status: 'PRESENT' }],
    });

    const me = await req('get', '/api/v1/attendance/me', studentToken);
    expect(me.summary.rate).toBe(100);
    expect(me.records.length).toBeGreaterThanOrEqual(1);
    recordId = me.records[0].id;
  });

  it('lets the student request a correction and the admin approve it (rate -> 0)', async () => {
    await req('post', `/api/v1/attendance/records/${recordId}/corrections`, studentToken, {
      requestedStatus: 'ABSENT',
      reason: 'I was marked wrong — I was absent',
    });

    const pending = await req(
      'get',
      '/api/v1/attendance/corrections?status=PENDING',
      adminToken,
    );
    const mine = (pending as Array<{ id: string; recordId: string }>).find(
      (c) => c.recordId === recordId,
    );
    expect(mine).toBeTruthy();

    await req('post', `/api/v1/attendance/corrections/${mine!.id}/review`, adminToken, {
      decision: 'APPROVE',
    });

    const me = await req('get', '/api/v1/attendance/me', studentToken);
    expect(me.summary.rate).toBe(0);
    expect(me.records[0].status).toBe('ABSENT');
  });

  it('forbids a student from creating an attendance session (403)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/attendance/sessions')
      .set(auth(studentToken))
      .send({ batchId, title: 'Nope' })
      .expect(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });
});
