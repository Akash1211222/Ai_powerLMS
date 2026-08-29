/**
 * Resetting a member's password.
 *
 * The request that prompted this was "the batch manager should always see the
 * student's password". Nothing can do that — only an argon2 hash is stored, and
 * keeping readable passwords would expose every student the moment one staff
 * account leaked. This is the same need met differently: a fresh password,
 * shown once, that the member must replace.
 *
 * Runs only when TEST_DATABASE_URL is set.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@fca/database';
import { PrismaService } from '../src/prisma/prisma.service';
import { PasswordService } from '../src/auth/password.service';
import { AuditService } from '../src/audit/audit.service';
import { AdminService } from '../src/admin/admin.service';
import { UserContextService } from '../src/authz/user-context.service';
import type { Env } from '../src/config/env';

const TEST_DB = process.env.TEST_DATABASE_URL;
const run = TEST_DB ? describe : describe.skip;
const cfg = (v: Record<string, unknown>) =>
  ({ get: (k: string) => v[k] }) as unknown as ConfigService<Env, true>;

run('resetMemberPassword', () => {
  let prisma: PrismaService;
  let admin: AdminService;
  let passwords: PasswordService;
  const tag = `pr-${Date.now()}`;
  const made: string[] = [];
  const id: Record<string, string> = {};

  const person = async (who: string, role: string, orgId: string) => {
    const r = await prisma.role.findFirst({ where: { name: role } });
    const u = await prisma.user.create({
      data: {
        email: `${tag}-${who}@example.test`,
        passwordHash: await passwords.hash('Original123!'),
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
        orgMemberships: { create: { organizationId: orgId, isPrimary: true } },
      },
    });
    if (r)
      await prisma.userRole.create({ data: { userId: u.id, roleId: r.id, organizationId: orgId } });
    made.push(u.id);
    return u.id;
  };

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB;
    prisma = new PrismaClient({ datasourceUrl: TEST_DB }) as unknown as PrismaService;
    passwords = new PasswordService(cfg({ ARGON2_MEMORY_COST: 4096, ARGON2_TIME_COST: 2 }));
    admin = new AdminService(
      prisma,
      new AuditService(prisma),
      new UserContextService(prisma),
      passwords,
    );

    const a = await prisma.organization.create({
      data: { name: `${tag} a`, slug: `${tag}-a`, type: 'COLLEGE' },
    });
    const b = await prisma.organization.create({
      data: { name: `${tag} b`, slug: `${tag}-b`, type: 'COLLEGE' },
    });
    id.orgA = a.id;
    id.orgB = b.id;

    id.batchManager = await person('bm', 'BATCH_MANAGER', a.id);
    id.student = await person('student', 'STUDENT', a.id);
    id.otherAdmin = await person('admin2', 'COLLEGE_ADMIN', a.id);
    id.admin = await person('admin', 'COLLEGE_ADMIN', a.id);
    id.superAdmin = await person('super', 'SUPER_ADMIN', a.id);
    id.foreignStudent = await person('foreign', 'STUDENT', b.id);
  });

  afterAll(async () => {
    if (!prisma) return;
    for (const uid of made) {
      await prisma.session.deleteMany({ where: { userId: uid } });
      await prisma.userRole.deleteMany({ where: { userId: uid } });
      await prisma.organizationMember.deleteMany({ where: { userId: uid } });
      await prisma.auditLog.deleteMany({ where: { actorUserId: uid } });
      await prisma.user.delete({ where: { id: uid } }).catch(() => undefined);
    }
    await prisma.organization.deleteMany({ where: { id: { in: [id.orgA, id.orgB] } } });
    await (prisma as unknown as PrismaClient).$disconnect();
  });

  it('lets a batch manager get a locked-out student back in', async () => {
    const res = await admin.resetMemberPassword(id.batchManager, id.student);

    expect(res.password).toBeTruthy();
    // Readable over a phone, and not the well-known role default.
    expect(res.password).not.toBe('Student123!');

    const after = await prisma.user.findUnique({ where: { id: id.student } });
    expect(await passwords.verify(after!.passwordHash, res.password)).toBe(true);
    expect(after!.mustChangePassword).toBe(true);
  });

  it('issues a different password every time', async () => {
    const a = await admin.resetMemberPassword(id.batchManager, id.student);
    const b = await admin.resetMemberPassword(id.batchManager, id.student);
    expect(a.password).not.toBe(b.password);
  });

  it('cuts existing sessions, in case the account was taken', async () => {
    const s = await prisma.session.create({
      data: {
        userId: id.student,
        refreshTokenHash: `${tag}-live-session`,
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });

    await admin.resetMemberPassword(id.batchManager, id.student);

    const after = await prisma.session.findUnique({ where: { id: s.id } });
    expect(after?.revokedAt).not.toBeNull();
    expect(after?.revokedReason).toBe('PASSWORD_RESET');
  });

  it('records who reset whose password', async () => {
    await admin.resetMemberPassword(id.batchManager, id.student);
    const entry = await prisma.auditLog.findFirst({
      where: {
        action: 'admin.member.password_reset',
        actorUserId: id.batchManager,
        targetId: id.student,
      },
      orderBy: { createdAt: 'desc' },
    });
    expect(entry).toBeTruthy();
  });

  it('refuses a student at another college', async () => {
    // Same wording as a missing member: whether an account exists elsewhere is
    // not this caller's business.
    await expect(admin.resetMemberPassword(id.batchManager, id.foreignStudent)).rejects.toThrow(
      /not found/i,
    );
  });

  it('refuses to reset upwards', async () => {
    await expect(admin.resetMemberPassword(id.batchManager, id.admin)).rejects.toThrow(
      /cannot act on this member/i,
    );
  });

  it('refuses between peers', async () => {
    // Two college admins resetting each other is account takeover with a
    // support flow's name on it.
    await expect(admin.resetMemberPassword(id.admin, id.otherAdmin)).rejects.toThrow(
      /cannot act on this member/i,
    );
  });

  it('never reaches a super admin', async () => {
    await expect(admin.resetMemberPassword(id.admin, id.superAdmin)).rejects.toThrow(
      /cannot act on this member/i,
    );
  });

  it('does not reset your own password this way', async () => {
    await expect(admin.resetMemberPassword(id.admin, id.admin)).rejects.toThrow(/own account/i);
  });
});
