/**
 * Notifications + Calendar e2e (§32, §33). Runs live in CI.
 *  - enrolling a student emits an ENROLLMENT notification (event-driven)
 *  - publishing an assignment notifies the batch
 *  - read / read-all / preferences work
 *  - the unified calendar aggregates a live-class schedule, an assignment
 *    deadline, and a personal event
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaClient } from '@fca/database';

const TEST_DB = process.env.TEST_DATABASE_URL;
const run = TEST_DB ? describe : describe.skip;

run('Notifications + Calendar (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let orgId: string;
  let studentId: string;
  let adminToken: string;
  let studentToken: string;
  let courseId = '';
  let batchId = '';

  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const soon = (days: number) => new Date(Date.now() + days * 86400000).toISOString();

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

    // Clear pre-existing notifications for a clean count.
    await prisma.notification.deleteMany({ where: { userId: studentId } });

    const course = await api('post', '/api/v1/courses', adminToken, {
      organizationId: orgId,
      title: `Notif Course ${Date.now()}`,
    });
    courseId = course.id;
    const mod = await api('post', `/api/v1/courses/${courseId}/modules`, adminToken, { title: 'M' });
    await api('post', `/api/v1/courses/modules/${mod.id}/lessons`, adminToken, { title: 'L' });
    await api('post', `/api/v1/courses/${courseId}/publish`, adminToken);
    const batch = await api('post', '/api/v1/batches', adminToken, {
      organizationId: orgId,
      courseId,
      name: `Notif Batch ${Date.now()}`,
    });
    batchId = batch.id;
    await api('post', `/api/v1/batches/${batchId}/students`, adminToken, {
      email: 'student@futurecorpacademy.in',
    });
  });

  afterAll(async () => {
    if (prisma) {
      if (batchId) {
        await prisma.enrollment.deleteMany({ where: { batchId } }).catch(() => undefined);
        await prisma.batch.delete({ where: { id: batchId } }).catch(() => undefined);
      }
      if (courseId) await prisma.course.delete({ where: { id: courseId } }).catch(() => undefined);
      await prisma.notification.deleteMany({ where: { userId: studentId } }).catch(() => undefined);
      await prisma.calendarEvent.deleteMany({ where: { userId: studentId } }).catch(() => undefined);
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
  async function api(method: 'post' | 'get' | 'patch', path: string, token: string, body?: unknown) {
    const r = request(app.getHttpServer())[method](path).set(auth(token));
    const res = await (body ? r.send(body) : r);
    if (res.status >= 400) throw new Error(`${method} ${path} -> ${res.status}: ${res.text}`);
    return res.body;
  }

  it('emits an enrollment notification and supports read/read-all', async () => {
    const list = await api('get', '/api/v1/notifications', studentToken);
    expect(list.unread).toBeGreaterThanOrEqual(1);
    const enrollNotif = (list.data as Array<{ id: string; type: string }>).find(
      (n) => n.type === 'ENROLLMENT',
    );
    expect(enrollNotif).toBeTruthy();

    await api('post', `/api/v1/notifications/${enrollNotif!.id}/read`, studentToken);
    const afterRead = await api('get', '/api/v1/notifications/unread-count', studentToken);
    expect(afterRead.unread).toBe(list.unread - 1);

    await api('post', '/api/v1/notifications/read-all', studentToken);
    expect((await api('get', '/api/v1/notifications/unread-count', studentToken)).unread).toBe(0);
  });

  it('notifies the batch when an assignment is published', async () => {
    const assignment = await api('post', '/api/v1/assignments', adminToken, {
      batchId,
      title: `Notif Assignment ${Date.now()}`,
      criteria: [{ title: 'x', weight: 10 }],
    });
    await api('post', `/api/v1/assignments/${assignment.id}/publish`, adminToken);
    const count = await api('get', '/api/v1/notifications/unread-count', studentToken);
    expect(count.unread).toBeGreaterThanOrEqual(1);
  });

  it('respects preference updates', async () => {
    const updated = await api('patch', '/api/v1/notifications/preferences', studentToken, {
      emailEnabled: false,
      mutedTypes: ['ACHIEVEMENT'],
    });
    expect(updated.emailEnabled).toBe(false);
    expect(updated.mutedTypes).toContain('ACHIEVEMENT');
  });

  it('aggregates the unified calendar (live class + deadline + personal)', async () => {
    await api('post', `/api/v1/batches/${batchId}/schedules`, adminToken, {
      title: 'Live Session',
      startsAt: soon(2),
      endsAt: soon(2.01),
    });
    const assignment = await api('post', '/api/v1/assignments', adminToken, {
      batchId,
      title: `Deadline Assignment ${Date.now()}`,
      dueAt: soon(3),
      criteria: [{ title: 'x', weight: 10 }],
    });
    await api('post', `/api/v1/assignments/${assignment.id}/publish`, adminToken);
    await api('post', '/api/v1/calendar/events', studentToken, {
      title: 'Revise Pandas',
      startsAt: soon(1),
    });

    const events = await api(
      'get',
      `/api/v1/calendar?from=${encodeURIComponent(soon(0))}&to=${encodeURIComponent(soon(10))}`,
      studentToken,
    );
    const types = (events as Array<{ type: string }>).map((e) => e.type);
    expect(types).toContain('LIVE_CLASS');
    expect(types).toContain('ASSIGNMENT_DUE');
    expect(types).toContain('PERSONAL_TASK');
  });
});
