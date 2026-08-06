#!/usr/bin/env node
/**
 * Production-safe RBAC bootstrap — roles + permissions only (no demo users).
 * Usage from repo root with DATABASE_URL set:
 *   node deploy/seed-rbac.mjs
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

async function main() {
  // Prefer built shared package; fall back to source path resolution via workspace.
  let shared;
  try {
    shared = require('@fca/shared');
  } catch {
    shared = require('../packages/shared/dist/index.js');
  }
  const { PrismaClient } = require('@prisma/client');
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
