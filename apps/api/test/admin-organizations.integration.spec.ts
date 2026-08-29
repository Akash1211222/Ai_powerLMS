/**
 * Opening a college.
 *
 * Everything about onboarding hangs off this: staff are created inside an
 * organisation, batches belong to one, and the branding that makes the LMS feel
 * like the college's own is stored on it. Until now nothing created one — they
 * only ever came from a seed.
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
import { createOrganizationSchema, updateOrganizationSchema } from '../src/admin/dto/admin.schemas';
import type { Env } from '../src/config/env';

const TEST_DB = process.env.TEST_DATABASE_URL;
const run = TEST_DB ? describe : describe.skip;
const cfg = (v: Record<string, unknown>) =>
  ({ get: (k: string) => v[k] }) as unknown as ConfigService<Env, true>;

run('createOrganization', () => {
  let prisma: PrismaService;
  let admin: AdminService;
  const tag = `org-${Date.now()}`;
  const made: string[] = [];
  let actorId = '';

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB;
    prisma = new PrismaClient({ datasourceUrl: TEST_DB }) as unknown as PrismaService;
    const passwords = new PasswordService(cfg({ ARGON2_MEMORY_COST: 4096, ARGON2_TIME_COST: 2 }));
    const tokens = new TokenService(
      new JwtService({}),
      cfg({ JWT_ACCESS_SECRET: 'x'.repeat(48), JWT_ACCESS_TTL: 900, JWT_REFRESH_TTL: 1209600 }),
    );
    admin = new AdminService(prisma, new AuditService(prisma), new UserContextService(prisma), passwords, tokens);

    const actor = await prisma.user.create({
      data: {
        email: `${tag}-owner@example.test`,
        passwordHash: await passwords.hash('Owner123!'),
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
      },
    });
    actorId = actor.id;
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.auditLog.deleteMany({ where: { actorUserId: actorId } });
    await prisma.organization.deleteMany({ where: { id: { in: made } } });
    await prisma.user.delete({ where: { id: actorId } }).catch(() => undefined);
    await (prisma as unknown as PrismaClient).$disconnect();
  });

  const create = async (name: string, extra: Record<string, unknown> = {}) => {
    const org = await admin.createOrganization(actorId, {
      name,
      type: 'COLLEGE',
      ...extra,
    } as Parameters<AdminService['createOrganization']>[1]);
    made.push(org.id);
    return org;
  };

  it('opens a college with its branding in one step', async () => {
    const org = await create(`${tag} St Xaviers College`, {
      displayName: "St. Xavier's",
      logoUrl: 'https://example.test/logo.png',
      primaryColor: '#4a0e1a',
    });

    expect(org.displayName).toBe("St. Xavier's");
    expect(org.primaryColor).toBe('#4a0e1a');
    expect(org.type).toBe('COLLEGE');
    // A URL-safe handle derived from the name.
    expect(org.slug).toMatch(/^[a-z0-9-]+$/);
  });

  it('gives a second college of the same name its own address', async () => {
    // Two colleges called "St. Xavier's" is ordinary in this market, so a
    // clash is a normal event rather than an error to hand back.
    const a = await create(`${tag} Same Name College`);
    const b = await create(`${tag} Same Name College`);
    expect(a.slug).not.toBe(b.slug);
  });

  it('opens a college with no branding at all', async () => {
    // An unbranded college keeps the product's own look; branding can come later.
    const org = await create(`${tag} Plain College`);
    expect(org.logoUrl).toBeNull();
    expect(org.primaryColor).toBeNull();
  });

  it('records who opened it', async () => {
    const org = await create(`${tag} Audited College`);
    const entry = await prisma.auditLog.findFirst({
      where: { action: 'admin.organization.created', targetId: org.id },
    });
    expect(entry?.actorUserId).toBe(actorId);
  });

  it('changes branding without touching the name or address', async () => {
    const org = await create(`${tag} Rebrand College`);
    const after = await admin.updateOrganization(actorId, org.id, {
      primaryColor: '#1e3a8a',
      displayName: 'Rebranded',
    });

    expect(after.primaryColor).toBe('#1e3a8a');
    expect(after.displayName).toBe('Rebranded');
    expect(after.slug).toBe(org.slug);
    expect(after.name).toBe(org.name);
  });

  it('refuses a college that does not exist', async () => {
    await expect(
      admin.updateOrganization(actorId, 'no-such-college', { primaryColor: '#123456' }),
    ).rejects.toThrow(/not found/i);
  });
});

describe('what the college form accepts', () => {
  it('takes a hex colour and nothing else', () => {
    // The colour reaches a stylesheet. A careful client is not a safeguard.
    expect(createOrganizationSchema.safeParse({ name: 'A College', primaryColor: '#1e3a8a' }).success).toBe(true);
    for (const bad of ['red', 'rgb(1,2,3)', '#12345', '</style><script>', 'javascript:alert(1)']) {
      expect(createOrganizationSchema.safeParse({ name: 'A College', primaryColor: bad }).success).toBe(false);
    }
  });

  it('insists a logo is served over https', () => {
    // An http image on an https page is blocked as mixed content, so allowing
    // it would only produce a logo that silently never appears.
    expect(createOrganizationSchema.safeParse({ name: 'A College', logoUrl: 'https://x.test/l.png' }).success).toBe(true);
    expect(createOrganizationSchema.safeParse({ name: 'A College', logoUrl: 'http://x.test/l.png' }).success).toBe(false);
    expect(createOrganizationSchema.safeParse({ name: 'A College', logoUrl: 'not-a-url' }).success).toBe(false);
  });

  it('needs a name worth showing', () => {
    expect(createOrganizationSchema.safeParse({ name: 'A' }).success).toBe(false);
    expect(createOrganizationSchema.safeParse({ name: '' }).success).toBe(false);
  });

  it('lets branding be cleared later', () => {
    // Null removes it; undefined leaves it alone. A college that drops its
    // logo should go back to the product's own look, not keep a stale one.
    expect(updateOrganizationSchema.safeParse({ logoUrl: null, primaryColor: null }).success).toBe(true);
  });
});
