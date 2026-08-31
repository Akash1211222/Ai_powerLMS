/**
 * A trainer sees their own students, and no others.
 *
 * Before this, `student:view` meant "every student in the college". A trainer
 * hired to teach one batch could open the marks, risk score, career profile and
 * placement record of every student the college had. Nothing in the suite
 * noticed, because every staff drill-down test signed in as a super admin.
 *
 * So this file signs in as a trainer on batch A and asks, against a real
 * database, for a student who is only in batch B.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaClient } from '@fca/database';
import * as argon2 from 'argon2';

const TEST_DB = process.env.TEST_DATABASE_URL;
const run = TEST_DB ? describe : describe.skip;
const PASSWORD = 'Password123!';

run('Student visibility (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  const tag = `vis-${Date.now()}`;
  const made: string[] = [];

  let orgId = '';
  let otherOrgId = '';
  let courseId = '';
  let batchA = '';
  let batchB = '';
  let studentA = '';
  let studentB = '';
  let studentBoth = '';

  let adminToken = '';
  let trainerToken = ''; // on batch A only
  let looseTrainerToken = ''; // on no batch at all
  let managerToken = ''; // batch manager, on no batch
  let placementToken = ''; // placement officer, on no batch
  let mentorToken = ''; // mentor, on no batch, with one mentee

  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  async function person(who: string, role: string, organizationId: string) {
    const r = await prisma.role.findFirstOrThrow({ where: { name: role } });
    const u = await prisma.user.create({
      data: {
        email: `${tag}-${who}@example.test`,
        passwordHash: await argon2.hash(PASSWORD, { type: argon2.argon2id }),
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
        profile: { create: { firstName: who, lastName: 'Vis' } },
        orgMemberships: { create: { organizationId, isPrimary: true } },
        roles: { create: { roleId: r.id, organizationId } },
      },
    });
    made.push(u.id);
    return u;
  }

  async function login(email: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: PASSWORD })
      .expect(200);
    return res.body.accessToken as string;
  }

  const get = (path: string, token: string) =>
    request(app.getHttpServer()).get(path).set(auth(token));

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB;
    prisma = new PrismaClient({ datasourceUrl: TEST_DB });
    orgId = (await prisma.organization.findUniqueOrThrow({ where: { slug: 'futurecorp-demo' } })).id;

    const other = await prisma.organization.create({
      data: { name: `${tag} Other College`, slug: `${tag}-other`, type: 'COLLEGE', status: 'ACTIVE' },
    });
    otherOrgId = other.id;

    const { AppModule } = await import('../src/app.module');
    const { AllExceptionsFilter } = await import('../src/common/filters/all-exceptions.filter');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1', { exclude: ['health', 'health/ready'] });
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();

    adminToken = await login('superadmin@futurecorpacademy.in');
    const superAdmin = await prisma.user.findUniqueOrThrow({
      where: { email: 'superadmin@futurecorpacademy.in' },
    });

    const trainer = await person('trainer-a', 'TRAINER', orgId);
    const loose = await person('trainer-none', 'TRAINER', orgId);
    const manager = await person('manager', 'BATCH_MANAGER', orgId);
    const placement = await person('placement', 'PLACEMENT_OFFICER', orgId);
    const mentor = await person('mentor', 'MENTOR', orgId);
    const sA = await person('student-a', 'STUDENT', orgId);
    const sB = await person('student-b', 'STUDENT', orgId);
    const sBoth = await person('student-both', 'STUDENT', orgId);
    studentA = sA.id;
    studentB = sB.id;
    studentBoth = sBoth.id;

    const course = await prisma.course.create({
      data: {
        organizationId: orgId,
        title: `${tag} Course`,
        slug: `${tag}-course`,
        status: 'PUBLISHED',
        createdById: superAdmin.id,
      },
    });
    courseId = course.id;

    const mk = async (name: string) =>
      (
        await prisma.batch.create({
          data: {
            organizationId: orgId,
            courseId,
            name: `${tag} ${name}`,
            code: `${tag}-${name}`,
            createdById: superAdmin.id,
          },
        })
      ).id;
    batchA = await mk('A');
    batchB = await mk('B');

    await prisma.batchTrainer.create({ data: { batchId: batchA, userId: trainer.id, role: 'LEAD' } });
    await prisma.batchStudent.createMany({
      data: [
        { batchId: batchA, userId: studentA, status: 'ACTIVE' },
        { batchId: batchB, userId: studentB, status: 'ACTIVE' },
        { batchId: batchA, userId: studentBoth, status: 'ACTIVE' },
        { batchId: batchB, userId: studentBoth, status: 'ACTIVE' },
      ],
    });

    // A mentor is on no batch at all, so batch scoping alone would leave them
    // unable to open the record of the student they are about to meet.
    const slot = await prisma.mentorSlot.create({
      data: {
        mentorId: mentor.id,
        startsAt: new Date(Date.now() + 86_400_000),
        endsAt: new Date(Date.now() + 90_000_000),
      },
    });
    await prisma.mentorBooking.create({
      data: {
        slotId: slot.id,
        mentorId: mentor.id,
        studentId: studentB,
        topic: 'Career direction',
        status: 'CONFIRMED',
      },
    });

    trainerToken = await login(trainer.email);
    mentorToken = await login(mentor.email);
    looseTrainerToken = await login(loose.email);
    managerToken = await login(manager.email);
    placementToken = await login(placement.email);
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.mentorBooking.deleteMany({ where: { mentorId: { in: made } } });
    await prisma.mentorSlot.deleteMany({ where: { mentorId: { in: made } } });
    await prisma.batchStudent.deleteMany({ where: { batchId: { in: [batchA, batchB] } } });
    await prisma.batchTrainer.deleteMany({ where: { batchId: { in: [batchA, batchB] } } });
    await prisma.batch.deleteMany({ where: { id: { in: [batchA, batchB] } } });
    await prisma.course.deleteMany({ where: { id: courseId } });
    await prisma.session.deleteMany({ where: { userId: { in: made } } });
    await prisma.userRole.deleteMany({ where: { userId: { in: made } } });
    await prisma.organizationMember.deleteMany({ where: { userId: { in: made } } });
    await prisma.auditLog.deleteMany({ where: { actorUserId: { in: made } } });
    await prisma.user.deleteMany({ where: { id: { in: made } } });
    await prisma.organization.deleteMany({ where: { id: otherOrgId } });
    await app?.close();
    await prisma.$disconnect();
  });

  // The drill-down endpoints a trainer reaches from a student row.
  const drilldowns = (id: string) => [
    `/api/v1/students/${id}/skills`,
    `/api/v1/students/${id}/score`,
    `/api/v1/students/${id}/risk`,
    `/api/v1/students/${id}/reports`,
    `/api/v1/students/${id}/interventions`,
    `/api/v1/students/${id}/recommendations`,
    `/api/v1/students/${id}/career-profile`,
    `/api/v1/students/${id}/placement`,
  ];

  it('refuses a trainer every record of a student in somebody else’s batch', async () => {
    // The case this whole change exists for.
    for (const path of drilldowns(studentB)) {
      const res = await get(path, trainerToken);
      expect(res.status, `${path} should be forbidden`).toBe(403);
    }
  });

  it('gives that trainer their own batch’s students', async () => {
    // Not "returns 200": a student who has never filled in a career profile
    // genuinely has none, and 404 is the honest answer. What must never appear
    // is 403 — that would mean the narrowing had swallowed their own batch.
    for (const path of drilldowns(studentA)) {
      const res = await get(path, trainerToken);
      expect(res.status, `${path} must not be forbidden`).not.toBe(403);
    }
  });

  it('counts a student in two batches as theirs', async () => {
    for (const path of drilldowns(studentBoth)) {
      const res = await get(path, trainerToken);
      expect(res.status, `${path} must not be forbidden`).not.toBe(403);
    }
  });

  it('shows a trainer with no batches nobody, rather than everybody', async () => {
    // Fail-closed: the narrow case must be what happens when nothing is set up,
    // because that is the state every new account starts in.
    for (const id of [studentA, studentB, studentBoth]) {
      const res = await get(`/api/v1/students/${id}/skills`, looseTrainerToken);
      expect(res.status).toBe(403);
    }
  });

  it('still lets the batch desk and the placement desk see the whole college', async () => {
    // Neither is assigned to any batch. Narrowing them would be the obvious
    // way to overshoot this change.
    for (const token of [managerToken, placementToken]) {
      for (const id of [studentA, studentB]) {
        const res = await get(`/api/v1/students/${id}/skills`, token);
        expect(res.status).not.toBe(403);
      }
    }
  });

  it('gives a mentor the student who booked them, and nobody else', async () => {
    // studentB is in a batch the mentor does not teach — the booking is the
    // whole reason they may look.
    expect((await get(`/api/v1/students/${studentB}/skills`, mentorToken)).status).not.toBe(403);
    expect((await get(`/api/v1/students/${studentA}/skills`, mentorToken)).status).toBe(403);
  });

  it('lists only the batches a trainer is on', async () => {
    const res = await get(`/api/v1/batches?organizationId=${orgId}`, trainerToken).expect(200);
    const ids = res.body.data.map((b: { id: string }) => b.id);
    expect(ids).toContain(batchA);
    expect(ids).not.toContain(batchB);
  });

  it('refuses a trainer another batch’s roster and risk list', async () => {
    expect((await get(`/api/v1/batches/${batchB}/students`, trainerToken)).status).toBe(403);
    expect((await get(`/api/v1/batches/${batchB}/at-risk`, trainerToken)).status).toBe(403);
  });

  it('keeps a trainer’s cohort to their own students', async () => {
    const res = await get(
      `/api/v1/intelligence/students?organizationId=${orgId}`,
      trainerToken,
    ).expect(200);
    const ids = res.body.students.map((s: { userId: string }) => s.userId);
    expect(ids).toContain(studentA);
    expect(ids).not.toContain(studentB);
  });

  it('refuses an out-of-scope batch filter instead of quietly returning nothing', async () => {
    // An empty 200 reads as "that batch has no students", which is a different
    // and false statement.
    const res = await get(
      `/api/v1/intelligence/students?organizationId=${orgId}&batchId=${batchB}`,
      trainerToken,
    );
    expect(res.status).toBe(403);
  });

  it('still refuses a student in another college outright', async () => {
    // The organisation wall is the one that separates customers; this change
    // narrows inside a college and must not have loosened it.
    const outsider = await person('outsider', 'STUDENT', otherOrgId);
    const res = await get(`/api/v1/students/${outsider.id}/skills`, trainerToken);
    expect(res.status).toBe(403);
  });

  it('keeps password reset and account access away from a trainer', async () => {
    const reset = await request(app.getHttpServer())
      .post(`/api/v1/admin/members/${studentA}/reset-password`)
      .set(auth(trainerToken));
    expect(reset.status).toBe(403);

    const viewAs = await request(app.getHttpServer())
      .post(`/api/v1/admin/members/${studentA}/view-as`)
      .set(auth(trainerToken));
    expect(viewAs.status).toBe(403);
  });

  it('leaves them with the batch manager, who is who students ask', async () => {
    const reset = await request(app.getHttpServer())
      .post(`/api/v1/admin/members/${studentA}/reset-password`)
      .set(auth(managerToken));
    expect(reset.status, reset.text).toBeLessThan(400);
    expect(reset.body.password).toBeTruthy();
  });

  it('gives a batch manager the college’s batches on their dashboard', async () => {
    // "My batches" is a different question for the two roles at rank 50: the
    // trainer's are the ones they were put on, the batch manager's are the
    // college's. Asking only who teaches what left every batch manager staring
    // at an empty board.
    const res = await get(`/api/v1/dashboard/trainer?organizationId=${orgId}`, managerToken).expect(
      200,
    );
    const ids = res.body.batches.map((b: { id: string }) => b.id);
    expect(ids).toEqual(expect.arrayContaining([batchA, batchB]));
    // They run the batch rather than teach it, so no borrowed title.
    expect(res.body.batches.every((b: { role: string | null }) => b.role === null)).toBe(true);
  });

  it('keeps the trainer’s dashboard to the batches they teach', async () => {
    const res = await get(`/api/v1/dashboard/trainer?organizationId=${orgId}`, trainerToken).expect(
      200,
    );
    const ids = res.body.batches.map((b: { id: string }) => b.id);
    expect(ids).toContain(batchA);
    expect(ids).not.toContain(batchB);
    expect(res.body.batches[0].role).toBe('LEAD');
  });

  it('lets the platform owner reach a college they just opened', async () => {
    // They are not a member of it — nobody is, a moment after it is created —
    // and every org-scoped check already waves them through. Listing only
    // memberships was the one thing making a brand-new college unreachable
    // from the screen that made it.
    const res = await get('/api/v1/me/organizations', adminToken).expect(200);
    const ids = res.body.map((o: { id: string }) => o.id);
    expect(ids).toContain(otherOrgId);
  });

  it('shows everybody else only the colleges they belong to', async () => {
    const res = await get('/api/v1/me/organizations', trainerToken).expect(200);
    const ids = res.body.map((o: { id: string }) => o.id);
    expect(ids).toContain(orgId);
    expect(ids).not.toContain(otherOrgId);
  });

  it('will not let anybody hand out a role above their own', async () => {
    // The longer route to the same place: creating the stronger account rather
    // than acting on one. Whoever makes an account is shown its password.
    const collegeAdmin = await person('college-admin', 'COLLEGE_ADMIN', orgId);
    const caToken = await login(collegeAdmin.email);

    const promote = await request(app.getHttpServer())
      .post('/api/v1/admin/members')
      .set(auth(caToken))
      .send({
        organizationId: orgId,
        email: `${tag}-escalate@example.test`,
        firstName: 'Esc',
        lastName: 'Alate',
        role: 'OPERATIONAL_LEAD',
      });
    expect(promote.status).toBe(403);

    // A peer is fine: adding a second college admin is ordinary onboarding.
    const peer = await request(app.getHttpServer())
      .post('/api/v1/admin/members')
      .set(auth(caToken))
      .send({
        organizationId: orgId,
        email: `${tag}-peer@example.test`,
        firstName: 'Peer',
        lastName: 'Admin',
        role: 'COLLEGE_ADMIN',
      });
    expect(peer.status, peer.text).toBeLessThan(400);
    made.push(peer.body.id);
  });

  it('does not let a super admin be reset by a batch manager', async () => {
    // Rank still decides who you may act on; this change did not touch it.
    const sup = await prisma.user.findUniqueOrThrow({
      where: { email: 'superadmin@futurecorpacademy.in' },
    });
    const res = await request(app.getHttpServer())
      .post(`/api/v1/admin/members/${sup.id}/reset-password`)
      .set(auth(managerToken));
    expect(res.status).toBe(403);
  });
});
