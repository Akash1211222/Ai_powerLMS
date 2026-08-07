/**
 * Does Meet attendance land on the right student?
 *
 * The import matches a CSV row to a batch member by email. The question that
 * matters operationally is WHICH email: the one they registered with, or the
 * Google account they happened to join the call from. In a college those are
 * frequently different people's addresses, so this pins down both — and pins
 * down what happens when they differ and nobody has told the LMS.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaClient } from '@fca/database';
import argon2 from 'argon2';

const TEST_DB = process.env.TEST_DATABASE_URL;
const run = TEST_DB ? describe : describe.skip;
const PASSWORD = 'Password123!';

run('Live attendance — email matching (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let adminToken: string;
  let orgId: string;
  let batchId: string;
  let scheduleId: string;
  let studentId: string;

  // Registered in the LMS...
  const registeredEmail = `att.${Date.now()}@futurecorpacademy.in`;
  // ...but this is the Google account they actually join Meet from.
  const personalGmail = `att.personal.${Date.now()}@gmail.com`;

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

    const role = await prisma.role.findUniqueOrThrow({ where: { name: 'STUDENT' } });
    const user = await prisma.user.create({
      data: {
        email: registeredEmail,
        passwordHash: await argon2.hash(PASSWORD, { type: argon2.argon2id }),
        status: 'ACTIVE',
        emailVerifiedAt: new Date(0),
        profile: { create: { firstName: 'Att', lastName: 'Tracker' } },
        orgMemberships: { create: { organizationId: orgId, isPrimary: true } },
        roles: { create: { roleId: role.id, organizationId: orgId } },
      },
    });
    studentId = user.id;

    const course = await req('post', '/api/v1/courses', adminToken, {
      organizationId: orgId,
      title: `Attendance Course ${Date.now()}`,
    });
    const mod = await req('post', `/api/v1/courses/${course.id}/modules`, adminToken, { title: 'M1' });
    await req('post', `/api/v1/courses/modules/${mod.id}/lessons`, adminToken, { title: 'L1' });
    await req('post', `/api/v1/courses/${course.id}/publish`, adminToken);
    const batch = await req('post', '/api/v1/batches', adminToken, {
      organizationId: orgId,
      courseId: course.id,
      name: `Attendance Batch ${Date.now()}`,
    });
    batchId = batch.id;
    await req('post', `/api/v1/batches/${batchId}/students`, adminToken, { userId: studentId });

    // Exactly 60 minutes, so attendance percentages are easy to reason about.
    const startsAt = new Date(Date.now() + 10 * 60_000);
    const endsAt = new Date(startsAt.getTime() + 60 * 60_000);
    const scheduled = await req('post', '/api/v1/live-classes', adminToken, {
      batchId,
      title: 'Attendance matching probe',
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      meetingUrl: 'meet.google.com/abc-defg-hij',
    });
    scheduleId = scheduled.id;
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  const importCsv = (csv: string) =>
    req('post', `/api/v1/live-classes/${scheduleId}/attendance/import`, adminToken, { csv });

  it('matches a student by the email they registered with', async () => {
    // A realistic Meet export: full 60 minutes of a 60 minute class.
    const csv = [
      'Name,Email,Duration,Time joined,Time exited',
      `Att Tracker,${registeredEmail},1:00:00,10:00:00 AM,11:00:00 AM`,
    ].join('\n');

    const out = await importCsv(csv);
    expect(out.summary.matched).toBe(1);
    expect(out.summary.unmatched).toBe(0);
    expect(out.matched[0].attendancePct).toBe(100);
    expect(out.matched[0].status).toBe('PRESENT');

    // Persisted against that student, not merely echoed back.
    const record = await prisma.attendanceRecord.findFirst({
      where: { studentId },
      orderBy: { createdAt: 'desc' },
    });
    expect(record?.status).toBe('PRESENT');
    expect(record?.attendancePct).toBe(100);
    expect(record?.source).toBe('IMPORT');
  });

  it('is case- and whitespace-insensitive about the address', async () => {
    const csv = ['Name,Email,Duration', `Att Tracker,  ${registeredEmail.toUpperCase()}  ,0:30:00`].join('\n');
    const out = await importCsv(csv);
    expect(out.summary.matched).toBe(1);
    expect(out.matched[0].attendancePct).toBe(50); // 30 of 60 minutes
  });

  it('does NOT match a personal Google account until googleEmail is set', async () => {
    const csv = ['Name,Email,Duration', `Att Tracker,${personalGmail},1:00:00`].join('\n');

    const before = await importCsv(csv);
    expect(before.summary.matched).toBe(0);
    expect(before.summary.unmatched).toBe(1);
    expect(before.unmatched[0].email).toBe(personalGmail);

    // This is exactly what the googleEmail field on the user is for.
    await prisma.user.update({ where: { id: studentId }, data: { googleEmail: personalGmail } });

    const after = await importCsv(csv);
    expect(after.summary.matched).toBe(1);
    expect(after.matched[0].attendancePct).toBe(100);
  });

  it('still matches the registered email after googleEmail is set', async () => {
    // Both must keep working — a student may join from either account.
    const csv = ['Name,Email,Duration', `Att Tracker,${registeredEmail},1:00:00`].join('\n');
    const out = await importCsv(csv);
    expect(out.summary.matched).toBe(1);
  });

  it('reports strangers in the call instead of silently dropping them', async () => {
    const csv = [
      'Name,Email,Duration',
      `Att Tracker,${registeredEmail},1:00:00`,
      'Random Guest,someone-else@example.com,0:45:00',
    ].join('\n');
    const out = await importCsv(csv);
    expect(out.summary.matched).toBe(1);
    expect(out.summary.unmatched).toBe(1);
    expect(out.unmatched[0].email).toBe('someone-else@example.com');
  });

  async function login(email: string) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: PASSWORD });
    expect(res.status).toBe(200);
    return res.body.accessToken as string;
  }

  async function req(method: 'get' | 'post' | 'patch', url: string, token: string, body?: unknown) {
    const r = request(app.getHttpServer())[method](url).set(auth(token));
    const res = body ? await r.send(body) : await r;
    if (res.status >= 400) throw new Error(`${method} ${url} -> ${res.status}: ${res.text}`);
    return res.body;
  }
});
