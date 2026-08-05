/**
 * Live Meet attendance import e2e.
 * Skips unless TEST_DATABASE_URL is set.
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

run('Live Meet attendance (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let orgId: string;
  let adminToken: string;
  let studentToken: string;
  let studentId = '';
  let studentEmail = '';
  let batchId = '';
  let scheduleId = '';

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

    studentEmail = `live.e2e.${Date.now()}@futurecorpacademy.in`;
    const role = await prisma.role.findUniqueOrThrow({ where: { name: 'STUDENT' } });
    const user = await prisma.user.create({
      data: {
        email: studentEmail,
        passwordHash: await argon2.hash(PASSWORD, { type: argon2.argon2id }),
        status: 'ACTIVE',
        emailVerifiedAt: new Date(0),
        profile: { create: { firstName: 'Live', lastName: 'E2E' } },
        orgMemberships: { create: { organizationId: orgId, isPrimary: true } },
        roles: { create: { roleId: role.id, organizationId: orgId } },
      },
    });
    studentId = user.id;
    studentToken = await login(studentEmail);

    const course = await req('post', '/api/v1/courses', adminToken, {
      organizationId: orgId,
      title: `Live Course ${Date.now()}`,
    });
    const mod = await req('post', `/api/v1/courses/${course.id}/modules`, adminToken, { title: 'M1' });
    await req('post', `/api/v1/courses/modules/${mod.id}/lessons`, adminToken, { title: 'L1' });
    await req('post', `/api/v1/courses/${course.id}/publish`, adminToken);
    const batch = await req('post', '/api/v1/batches', adminToken, {
      organizationId: orgId,
      courseId: course.id,
      name: `Live Batch ${Date.now()}`,
    });
    batchId = batch.id;
    await req('post', `/api/v1/batches/${batchId}/students`, adminToken, { userId: studentId });

    const startsAt = new Date(Date.now() + 10 * 60_000).toISOString();
    const endsAt = new Date(Date.now() + 10 * 60_000 + 2 * 60 * 60_000).toISOString();
    const scheduled = await req('post', '/api/v1/live-classes', adminToken, {
      batchId,
      title: 'Meet duration import smoke',
      startsAt,
      endsAt,
      meetingUrl: 'https://meet.google.com/abc-defg-hij',
    });
    scheduleId = scheduled.id;
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('requires Meet URL, imports CSV as 50% LATE, and stores summary notes', async () => {
    const bad = await request(app.getHttpServer())
      .post('/api/v1/live-classes')
      .set(auth(adminToken))
      .send({
        batchId,
        title: 'Missing meet',
        startsAt: new Date(Date.now() + 20 * 60_000).toISOString(),
        endsAt: new Date(Date.now() + 80 * 60_000).toISOString(),
      });
    expect(bad.status).toBeGreaterThanOrEqual(400);

    const csv = `Name,Email,Duration\nLive E2E,${studentEmail},1:00:00`;
    const imported = await req('post', `/api/v1/live-classes/${scheduleId}/attendance/import`, adminToken, {
      csv,
      endClass: true,
    });
    expect(imported.summary.matched).toBe(1);
    expect(imported.matched[0].attendancePct).toBe(50);
    expect(imported.matched[0].status).toBe('LATE');

    const notes = await req('patch', `/api/v1/live-classes/${scheduleId}/summary`, adminToken, {
      summary: 'Covered Meet import flow.',
      keyPoints: ['CSV is source of truth', '50% → LATE'],
      homework: 'Export Meet attendance after every class',
      qaItems: [{ question: 'Why CSV?', answer: 'Meet cannot be embedded; duration lives in Meet.' }],
    });
    expect(notes.summary).toContain('Meet import');

    const listed = await req('get', `/api/v1/live-classes/notes?courseId=${(await prisma.batch.findUniqueOrThrow({ where: { id: batchId } })).courseId}`, studentToken);
    expect(listed.some((n: { id: string }) => n.id === scheduleId)).toBe(true);
  });

  async function login(email: string) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: PASSWORD });
    expect(res.status).toBe(201);
    return res.body.accessToken as string;
  }

  async function req(method: 'get' | 'post' | 'patch', url: string, token: string, body?: unknown) {
    const r = request(app.getHttpServer())[method](url).set(auth(token));
    const res = body ? await r.send(body) : await r;
    expect(res.status).toBeLessThan(400);
    return res.body;
  }
});
