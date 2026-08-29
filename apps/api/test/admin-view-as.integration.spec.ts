/**
 * Looking at a member's account without becoming them.
 *
 * The original ask was for staff to hold a student's password. This is the part
 * that actually solves the problem behind it — seeing the screen the student is
 * describing — while leaving a record of who looked, and without handing over a
 * credential that outlives the conversation.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient } from '@fca/database';
import { PrismaService } from '../src/prisma/prisma.service';
import { PasswordService } from '../src/auth/password.service';
import { TokenService } from '../src/auth/token.service';
import { AuditService } from '../src/audit/audit.service';
import { AdminService } from '../src/admin/admin.service';
import { UserContextService } from '../src/authz/user-context.service';
import type { Env } from '../src/config/env';

const TEST_DB = process.env.TEST_DATABASE_URL;
const run = TEST_DB ? describe : describe.skip;
const cfg = (v: Record<string, unknown>) =>
  ({ get: (k: string) => v[k] }) as unknown as ConfigService<Env, true>;

run('viewAsMember', () => {
  let prisma: PrismaService;
  let admin: AdminService;
  let tokens: TokenService;
  const tag = `va-${Date.now()}`;
  const made: string[] = [];
  const id: Record<string, string> = {};

  const person = async (who: string, role: string, orgId: string, status = 'ACTIVE') => {
    const r = await prisma.role.findFirst({ where: { name: role } });
    const passwords = new PasswordService(cfg({ ARGON2_MEMORY_COST: 4096, ARGON2_TIME_COST: 2 }));
    const u = await prisma.user.create({
      data: {
        email: `${tag}-${who}@example.test`,
        passwordHash: await passwords.hash('Original123!'),
        status: status as 'ACTIVE',
        emailVerifiedAt: new Date(),
        profile: { create: { firstName: who, lastName: 'Test' } },
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
    const passwords = new PasswordService(cfg({ ARGON2_MEMORY_COST: 4096, ARGON2_TIME_COST: 2 }));
    tokens = new TokenService(
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
    id.admin = await person('admin', 'COLLEGE_ADMIN', a.id);
    id.suspended = await person('suspended', 'STUDENT', a.id, 'SUSPENDED');
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

  it('hands back a token that is the student, driven by the staff member', async () => {
    const res = await admin.viewAsMember(id.batchManager, id.student);
    const claims = await tokens.verifyAccessToken(res.accessToken);

    // The session *is* the student — their permissions, not the staff member's.
    expect(claims.sub).toBe(id.student);
    // …but the record of who is driving travels with it.
    expect(claims.act).toBe(id.batchManager);
    expect(res.viewing.id).toBe(id.student);
  });

  it('issues no refresh token, so the borrowed session cannot be extended', async () => {
    const res = await admin.viewAsMember(id.batchManager, id.student);
    expect(res).not.toHaveProperty('refreshToken');
  });

  it('expires on its own, in minutes rather than hours', async () => {
    const res = await admin.viewAsMember(id.batchManager, id.student);
    expect(res.expiresIn).toBeLessThanOrEqual(15 * 60);

    const claims = (await tokens.verifyAccessToken(res.accessToken)) as unknown as {
      exp: number;
      iat: number;
    };
    expect(claims.exp - claims.iat).toBeLessThanOrEqual(15 * 60);
  });

  it('does not drag staff into the student password-change flow', async () => {
    // A student who must change their password would otherwise trap the person
    // looking at the account on the change-password screen.
    await prisma.user.update({ where: { id: id.student }, data: { mustChangePassword: true } });
    const res = await admin.viewAsMember(id.batchManager, id.student);
    const claims = await tokens.verifyAccessToken(res.accessToken);
    expect(claims.mcp).toBeUndefined();
    await prisma.user.update({ where: { id: id.student }, data: { mustChangePassword: false } });
  });

  it('records every time somebody looks', async () => {
    await admin.viewAsMember(id.batchManager, id.student);
    const entry = await prisma.auditLog.findFirst({
      where: {
        action: 'admin.member.viewed_as',
        actorUserId: id.batchManager,
        targetId: id.student,
      },
      orderBy: { createdAt: 'desc' },
    });
    expect(entry).toBeTruthy();
  });

  it('refuses a student at another college', async () => {
    await expect(admin.viewAsMember(id.batchManager, id.foreignStudent)).rejects.toThrow(
      /not found/i,
    );
  });

  it('refuses to look upwards', async () => {
    // Otherwise "view as" is a ladder: borrow the admin's account, keep their
    // permissions, and the audit trail shows the admin acting.
    await expect(admin.viewAsMember(id.batchManager, id.admin)).rejects.toThrow(
      /cannot act on this member/i,
    );
  });

  it('refuses an account that is not active', async () => {
    await expect(admin.viewAsMember(id.admin, id.suspended)).rejects.toThrow(/not active/i);
  });
});
