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
// Resolve workspace packages from their package roots (pnpm layout).
const requireDb = createRequire(path.join(root, 'packages/database/package.json'));
const requireShared = createRequire(path.join(root, 'packages/shared/package.json'));

async function main() {
  const { PrismaClient } = requireDb('@prisma/client');
  const shared = requireShared('@fca/shared');
  const { ROLES, ALL_PERMISSIONS, DEFAULT_ROLE_PERMISSIONS } = shared;
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

  await prisma.organization.upsert({
    where: { slug: 'futurecorp-academy' },
    update: {},
    create: {
      name: 'FutureCorp Academy',
      slug: 'futurecorp-academy',
      type: 'COLLEGE',
      status: 'ACTIVE',
    },
  });

  console.log(`RBAC ready: ${ROLES.length} roles, ${ALL_PERMISSIONS.length} permissions`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
