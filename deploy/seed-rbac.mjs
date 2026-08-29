#!/usr/bin/env node
/**
 * Production-safe RBAC bootstrap — roles + permissions only (no demo users).
 * Usage from repo root with DATABASE_URL set (or packages/database/.env linked):
 *   node deploy/seed-rbac.mjs
 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { applyEnvFile } = require('./load-env.cjs');
applyEnvFile(path.join(root, '.env'), { override: true });

// Resolve workspace packages from their package roots (pnpm layout).
const requireDb = createRequire(path.join(root, 'packages/database/package.json'));
const requireShared = createRequire(path.join(root, 'packages/shared/package.json'));

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL missing — check /opt/fca-lms/.env quoting');
  }
  const { PrismaClient } = requireDb('@prisma/client');
  const shared = requireShared('@fca/shared');
  const { ROLES, ALL_PERMISSIONS, DEFAULT_ROLE_PERMISSIONS, REVOKED_ROLE_PERMISSIONS } = shared;
  const prisma = new PrismaClient();

  for (const key of ALL_PERMISSIONS) {
    await prisma.permission.upsert({
      where: { key },
      update: {},
      create: { key },
    });
  }
  const permissionRows = await prisma.permission.findMany();
  const permIdByKey = new Map(permissionRows.map((p) => [p.key, p.id]));

  for (const name of ROLES) {
    const role = await prisma.role.upsert({
      where: { name },
      update: {},
      create: { name, isSystem: true },
    });
    for (const permKey of DEFAULT_ROLE_PERMISSIONS[name] ?? []) {
      const permissionId = permIdByKey.get(permKey);
      if (!permissionId) continue;
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId } },
        update: {},
        create: { roleId: role.id, permissionId },
      });
    }
  }

  // Our own academy — the B2C course business — rather than a customer.
  // The distinction is what stops the LMS branding itself as a college it is
  // not: an unbranded *college* now shows its own name in the header, and this
  // org is the one place where the product logo is the right answer. The type
  // is in `update` as well as `create` because this row predates the
  // distinction and has to be corrected in place.
  // Take back the grants that were deliberately withdrawn. This loop is the
  // only thing in the deploy that deletes a permission, and it deletes exactly
  // what is named — nothing is inferred from what is missing above.
  let revoked = 0;
  for (const [name, perms] of Object.entries(REVOKED_ROLE_PERMISSIONS ?? {})) {
    const role = await prisma.role.findUnique({ where: { name } });
    if (!role) continue;
    for (const permKey of perms) {
      const permissionId = permIdByKey.get(permKey);
      if (!permissionId) continue;
      const { count } = await prisma.rolePermission.deleteMany({
        where: { roleId: role.id, permissionId },
      });
      revoked += count;
    }
  }

  await prisma.organization.upsert({
    where: { slug: 'futurecorp-academy' },
    update: { type: 'INTERNAL' },
    create: {
      name: 'FutureCorp Academy',
      slug: 'futurecorp-academy',
      type: 'INTERNAL',
      status: 'ACTIVE',
    },
  });

  console.log(
    `RBAC ready: ${ROLES.length} roles, ${ALL_PERMISSIONS.length} permissions` +
      (revoked ? `, ${revoked} grant(s) revoked` : ''),
  );
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
