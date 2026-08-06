#!/usr/bin/env node
/**
 * Create the first SUPER_ADMIN without running the demo seed.
 * Usage (from repo root, with .env exported):
 *   node deploy/bootstrap-admin.mjs --email admin@futurecorpacademy.in --password 'StrongPass123!' --first Sasha --last Admin
 */
import { createRequire } from 'node:module';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { applyEnvFile } = require('./load-env.cjs');
applyEnvFile(path.join(root, '.env'), { override: true });

const requireDb = createRequire(path.join(root, 'packages/database/package.json'));

async function main() {
  const { values } = parseArgs({
    options: {
      email: { type: 'string' },
      password: { type: 'string' },
      first: { type: 'string', default: 'Admin' },
      last: { type: 'string', default: 'User' },
    },
  });

  if (!values.email || !values.password || values.password.length < 10) {
    console.error('Required: --email and --password (>=10 chars)');
    process.exit(1);
  }

  const { PrismaClient } = requireDb('@prisma/client');
  // argon2 is a dependency of @fca/database (dev) — resolve via that package root
  const argon2 = requireDb('argon2');
  const prisma = new PrismaClient();

  const email = values.email.toLowerCase().trim();
  const passwordHash = await argon2.hash(values.password, { type: argon2.argon2id });

  const role = await prisma.role.findUnique({ where: { name: 'SUPER_ADMIN' } });
  if (!role) {
    console.error('SUPER_ADMIN role missing — run seed-rbac.mjs after migrate deploy.');
    process.exit(1);
  }

  let org = await prisma.organization.findFirst({
    where: { OR: [{ slug: 'futurecorp-academy' }, { slug: 'futurecorp-demo' }] },
  });
  if (!org) {
    org = await prisma.organization.create({
      data: { name: 'FutureCorp Academy', slug: 'futurecorp-academy', type: 'COLLEGE', status: 'ACTIVE' },
    });
  }

  const user = await prisma.user.upsert({
    where: { email },
    update: {
      passwordHash,
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
    },
    create: {
      email,
      passwordHash,
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
      profile: { create: { firstName: values.first, lastName: values.last } },
      orgMemberships: { create: { organizationId: org.id, isPrimary: true } },
      roles: { create: { roleId: role.id, organizationId: org.id } },
    },
  });

  await prisma.organizationMember.upsert({
    where: { organizationId_userId: { organizationId: org.id, userId: user.id } },
    update: { isPrimary: true },
    create: { userId: user.id, organizationId: org.id, isPrimary: true },
  });
  const existingRole = await prisma.userRole.findFirst({
    where: { userId: user.id, roleId: role.id, organizationId: org.id },
  });
  if (!existingRole) {
    await prisma.userRole.create({
      data: { userId: user.id, roleId: role.id, organizationId: org.id },
    });
  }

  console.log(`Admin ready: ${email} (org ${org.slug})`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
