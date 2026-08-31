/**
 * Provisioning course access when an account is created.
 *
 * A student who buys on the website is paying for the recorded material, a
 * seat in a live batch, or both. The distinction was always in the data — an
 * enrolment with no batch is recorded access — but nothing offered the choice,
 * so every account arrived with neither and somebody had to fix it by hand.
 *
 * Runs only when TEST_DATABASE_URL is set, like the other integration specs.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@fca/database';
import { PrismaService } from '../src/prisma/prisma.service';
import { PasswordService } from '../src/auth/password.service';
import { AuditService } from '../src/audit/audit.service';
import { AdminService } from '../src/admin/admin.service';
import { UserContextService } from '../src/authz/user-context.service';
import { TokenService } from '../src/auth/token.service';
import { JwtService } from '@nestjs/jwt';
import type { Env } from '../src/config/env';

const TEST_DB = process.env.TEST_DATABASE_URL;
const run = TEST_DB ? describe : describe.skip;

const cfg = (v: Record<string, unknown>) =>
  ({ get: (k: string) => v[k] }) as unknown as ConfigService<Env, true>;

run('createMember — course access', () => {
  let prisma: PrismaService;
  let admin: AdminService;
  const tag = `ca-${Date.now()}`;
  const ids = { org: '', otherOrg: '', course: '', otherCourse: '', batch: '', actor: '' };
  const made: string[] = [];

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB;
    prisma = new PrismaClient({ datasourceUrl: TEST_DB }) as unknown as PrismaService;
    const passwords = new PasswordService(cfg({ ARGON2_MEMORY_COST: 4096, ARGON2_TIME_COST: 2 }));
    const tokens = new TokenService(
      new JwtService({}),
      cfg({ JWT_ACCESS_SECRET: 'x'.repeat(48), JWT_ACCESS_TTL: 900, JWT_REFRESH_TTL: 1209600 }),
    );
    admin = new AdminService(
      prisma,
      new AuditService(prisma),
      new UserContextService(prisma),
      passwords,
      tokens,
    );

    const org = await prisma.organization.create({
      data: { name: `${tag} college`, slug: `${tag}-a`, type: 'COLLEGE' },
    });
    const otherOrg = await prisma.organization.create({
      data: { name: `${tag} rival`, slug: `${tag}-b`, type: 'COLLEGE' },
    });
    ids.org = org.id;
    ids.otherOrg = otherOrg.id;

    // The admin doing the creating must belong to the org they create into, and
    // must hold a role: permissions come only from roles, so an actor without
    // one could never reach this service in production — and cannot hand out a
    // role of its own either.
    const collegeAdmin = await prisma.role.findFirstOrThrow({ where: { name: 'COLLEGE_ADMIN' } });
    const actor = await prisma.user.create({
      data: {
        email: `${tag}-actor@example.test`,
        passwordHash: await passwords.hash('Actor123!'),
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
        orgMemberships: { create: { organizationId: org.id, isPrimary: true } },
        roles: { create: { roleId: collegeAdmin.id, organizationId: org.id } },
      },
    });
    ids.actor = actor.id;
    made.push(actor.id);

    const mk = (orgId: string, slug: string) =>
      prisma.course.create({
        data: {
          organizationId: orgId,
          title: slug,
          slug,
          status: 'PUBLISHED',
          createdById: actor.id,
        },
      });
    ids.course = (await mk(org.id, `${tag}-course`)).id;
    ids.otherCourse = (await mk(otherOrg.id, `${tag}-rival-course`)).id;

    const batch = await prisma.batch.create({
      data: {
        organizationId: org.id,
        courseId: ids.course,
        name: `${tag} batch`,
        code: `${tag.toUpperCase()}`,
        createdById: actor.id,
      },
    });
    ids.batch = batch.id;
  });

  afterAll(async () => {
    if (!prisma) return;
    for (const id of made) {
      await prisma.enrollment.deleteMany({ where: { userId: id } });
      await prisma.batchStudent.deleteMany({ where: { userId: id } });
      await prisma.userRole.deleteMany({ where: { userId: id } });
      await prisma.organizationMember.deleteMany({ where: { userId: id } });
      await prisma.auditLog.deleteMany({ where: { actorUserId: id } });
      await prisma.user.delete({ where: { id } }).catch(() => undefined);
    }
    await prisma.batch.deleteMany({ where: { id: ids.batch } });
    await prisma.course.deleteMany({ where: { id: { in: [ids.course, ids.otherCourse] } } });
    await prisma.organization.deleteMany({ where: { id: { in: [ids.org, ids.otherOrg] } } });
    await (prisma as unknown as PrismaClient).$disconnect();
  });

  const create = async (extra: Record<string, unknown>, who: string) => {
    const res = await admin.createMember(ids.actor, {
      organizationId: ids.org,
      email: `${tag}-${who}@example.test`,
      firstName: 'Test',
      lastName: who,
      role: 'STUDENT',
      ...extra,
    } as Parameters<AdminService['createMember']>[1]);
    made.push(res.id);
    return res;
  };

  it('gives recorded access as an enrolment with no batch', async () => {
    const member = await create({ recordedCourseIds: [ids.course] }, 'recorded');
    const rows = await prisma.enrollment.findMany({ where: { userId: member.id } });

    expect(rows).toHaveLength(1);
    expect(rows[0]?.courseId).toBe(ids.course);
    expect(rows[0]?.batchId).toBeNull();
    // Recorded material is not a cohort, so they are on nobody's roster.
    expect(await prisma.batchStudent.count({ where: { userId: member.id } })).toBe(0);
  });

  it('gives a live seat as an enrolment plus a place on the roster', async () => {
    const member = await create({ batchIds: [ids.batch] }, 'live');
    const rows = await prisma.enrollment.findMany({ where: { userId: member.id } });

    expect(rows).toHaveLength(1);
    expect(rows[0]?.batchId).toBe(ids.batch);
    // The course comes from the batch — no second choice to get wrong.
    expect(rows[0]?.courseId).toBe(ids.course);
    // Attendance and grading read the roster, not the enrolment.
    expect(
      await prisma.batchStudent.count({ where: { userId: member.id, batchId: ids.batch } }),
    ).toBe(1);
  });

  it('treats a live seat as covering that course, not as a second enrolment', async () => {
    // Somebody can only be enrolled in a course once, and a live seat already
    // carries the material. Asking for the recordings AND the batch of the same
    // course is one enrolment, with the batch — asking for two would have hit a
    // unique constraint and failed the whole purchase.
    const member = await create({ recordedCourseIds: [ids.course], batchIds: [ids.batch] }, 'both');
    const rows = await prisma.enrollment.findMany({ where: { userId: member.id } });

    expect(rows).toHaveLength(1);
    expect(rows[0]?.batchId).toBe(ids.batch);
    expect(await prisma.batchStudent.count({ where: { userId: member.id } })).toBe(1);
  });

  it('still creates a plain account when nothing is selected', async () => {
    const member = await create({}, 'none');
    expect(await prisma.enrollment.count({ where: { userId: member.id } })).toBe(0);
  });

  it('refuses a course belonging to another college', async () => {
    // The tenant check guards the organisation the member is created in — it
    // says nothing about ids pasted into the body. Without this, an admin could
    // enrol their own student into a rival college's course.
    await expect(create({ recordedCourseIds: [ids.otherCourse] }, 'cross-course')).rejects.toThrow(
      /does not belong to this organization/i,
    );
  });

  it('refuses an unknown batch rather than silently skipping it', async () => {
    await expect(create({ batchIds: ['no-such-batch'] }, 'ghost-batch')).rejects.toThrow(
      /does not belong to this organization/i,
    );
  });

  it('creates nothing at all when part of the request is invalid', async () => {
    // A half-provisioned account is worse than a refused one: the buyer has a
    // login that silently lacks what they paid for.
    const email = `${tag}-atomic@example.test`;
    await expect(
      admin.createMember(ids.actor, {
        organizationId: ids.org,
        email,
        firstName: 'Test',
        lastName: 'atomic',
        role: 'STUDENT',
        recordedCourseIds: [ids.course, ids.otherCourse],
      } as Parameters<AdminService['createMember']>[1]),
    ).rejects.toThrow();

    expect(await prisma.user.findUnique({ where: { email } })).toBeNull();
  });
});
