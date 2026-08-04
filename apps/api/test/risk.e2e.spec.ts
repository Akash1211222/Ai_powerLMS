/**
 * At-risk detection e2e (§18). Runs live in CI.
 *   admin marks an isolated student absent across sessions -> risk evaluates to a
 *   non-LOW level with explainable factors + recommended actions
 *   trainer/admin sees them in the batch at-risk queue
 *   student cannot read risk data (403)
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

run('At-risk detection (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let orgId: string;
  let studentId: string;
  let studentEmail = '';
  let adminToken: string;
  let studentToken: string;
  let courseId = '';
  let batchId = '';

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

    // Fresh student with no prior attendance/grades so risk signals stay deterministic.
    studentEmail = `risk.e2e.${Date.now()}@futurecorpacademy.in`;
    const role = await prisma.role.findUniqueOrThrow({ where: { name: 'STUDENT' } });
    const user = await prisma.user.create({
      data: {
        email: studentEmail,
        passwordHash: await argon2.hash(PASSWORD, { type: argon2.argon2id }),
        status: 'ACTIVE',
        emailVerifiedAt: new Date(0),
        profile: { create: { firstName: 'Risk', lastName: 'E2E' } },
        orgMemberships: { create: { organizationId: orgId, isPrimary: true } },
        roles: { create: { roleId: role.id, organizationId: orgId } },
      },
    });
    studentId = user.id;
    studentToken = await login(studentEmail);

    await prisma.studentRiskSnapshot.deleteMany({ where: { userId: studentId } });

    const course = await api('post', '/api/v1/courses', adminToken, {
      organizationId: orgId,
      title: `Risk Course ${Date.now()}`,
    });
    courseId = course.id;
    const mod = await api('post', `/api/v1/courses/${courseId}/modules`, adminToken, { title: 'M' });
    await api('post', `/api/v1/courses/modules/${mod.id}/lessons`, adminToken, { title: 'L' });
    await api('post', `/api/v1/courses/${courseId}/publish`, adminToken);
    const batch = await api('post', '/api/v1/batches', adminToken, {
      organizationId: orgId,
      courseId,
      name: `Risk Batch ${Date.now()}`,
    });
    batchId = batch.id;
    await api('post', `/api/v1/batches/${batchId}/students`, adminToken, { email: studentEmail });
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.studentRiskSnapshot.deleteMany({ where: { userId: studentId } }).catch(() => undefined);
      if (studentId) {
        await prisma.attendanceRecord.deleteMany({ where: { studentId } }).catch(() => undefined);
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
  async function api(method: 'post' | 'get', path: string, token: string, body?: unknown) {
    const r = request(app.getHttpServer())[method](path).set(auth(token));
    const res = await (body ? r.send(body) : r);
    if (res.status >= 400) throw new Error(`${method} ${path} -> ${res.status}: ${res.text}`);
    return res.body;
  }

  it('flags a repeatedly absent student with explainable factors', async () => {
    for (let i = 0; i < 3; i++) {
      const session = await api('post', '/api/v1/attendance/sessions', adminToken, {
        batchId,
        title: `Session ${i + 1}`,
        sessionDate: new Date(Date.now() - (2 - i) * 60_000).toISOString(),
      });
      await api('post', `/api/v1/attendance/sessions/${session.id}/mark`, adminToken, {
        records: [{ studentId, status: 'ABSENT' }],
      });
    }

    const result = await api('post', `/api/v1/students/${studentId}/risk/evaluate`, adminToken);
    expect(result.level).not.toBe('LOW');
    expect(result.score).toBeGreaterThan(0);

    const codes = (result.factors as Array<{ code: string }>).map((f) => f.code);
    expect(codes).toContain('ATTENDANCE_LOW');
    expect(codes).toContain('CONSECUTIVE_ABSENCE');
    expect(result.recommendedActions.length).toBeGreaterThan(0);

    const snap = await api('get', `/api/v1/students/${studentId}/risk`, adminToken);
    expect(snap.latest).toBeTruthy();
    expect(snap.latest.ruleVersion).toBeGreaterThanOrEqual(1);
    expect(snap.latest.factors.length).toBeGreaterThan(0);
  });

  it('surfaces the student in the batch at-risk queue', async () => {
    const queue = await api('get', `/api/v1/batches/${batchId}/at-risk`, adminToken);
    const row = (queue as Array<{ userId: string; level: string }>).find((r) => r.userId === studentId);
    expect(row).toBeTruthy();
    expect(row!.level).not.toBe('LOW');
  });

  it('forbids a student from reading risk data (403)', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/students/${studentId}/risk`)
      .set(auth(studentToken))
      .expect(403);
  });
});
