/**
 * Development seed (§42). Idempotent — safe to run repeatedly.
 *
 * ⚠️ DEVELOPMENT DATA ONLY. All accounts share a well-known password and must
 * never exist in production. Production bootstrapping uses a separate,
 * interactive admin-creation flow (added in a later milestone).
 */
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import {
  ROLES,
  ALL_PERMISSIONS,
  DEFAULT_ROLE_PERMISSIONS,
  type RoleName,
} from '@fca/shared';

const prisma = new PrismaClient();

const DEV_PASSWORD = 'Password123!';

/** One seed user per role. */
const SEED_USERS: Array<{ email: string; firstName: string; lastName: string; role: RoleName }> = [
  { email: 'superadmin@futurecorpacademy.in', firstName: 'Sasha', lastName: 'Admin', role: 'SUPER_ADMIN' },
  { email: 'collegeadmin@futurecorpacademy.in', firstName: 'Colin', lastName: 'Dean', role: 'COLLEGE_ADMIN' },
  { email: 'batchmanager@futurecorpacademy.in', firstName: 'Bianca', lastName: 'Ops', role: 'BATCH_MANAGER' },
  { email: 'trainer@futurecorpacademy.in', firstName: 'Tara', lastName: 'Rao', role: 'TRAINER' },
  { email: 'mentor@futurecorpacademy.in', firstName: 'Manoj', lastName: 'Guide', role: 'MENTOR' },
  { email: 'placement@futurecorpacademy.in', firstName: 'Priya', lastName: 'Placeworth', role: 'PLACEMENT_OFFICER' },
  { email: 'recruiter@futurecorpacademy.in', firstName: 'Ravi', lastName: 'Hunter', role: 'RECRUITER' },
  { email: 'alumni@futurecorpacademy.in', firstName: 'Alia', lastName: 'Past', role: 'ALUMNI' },
  { email: 'student@futurecorpacademy.in', firstName: 'Sam', lastName: 'Learner', role: 'STUDENT' },
];

async function main() {
  console.log('🌱 Seeding FutureCorp Academy (development data)...');

  // 1) Permissions
  for (const key of ALL_PERMISSIONS) {
    await prisma.permission.upsert({
      where: { key },
      update: {},
      create: { key },
    });
  }
  const permissionRows = await prisma.permission.findMany();
  const permIdByKey = new Map(permissionRows.map((p) => [p.key, p.id]));

  // 2) Roles + role→permission links
  for (const name of ROLES) {
    const role = await prisma.role.upsert({
      where: { name },
      update: {},
      create: { name, isSystem: true },
    });
    const desired = DEFAULT_ROLE_PERMISSIONS[name];
    for (const permKey of desired) {
      const permissionId = permIdByKey.get(permKey);
      if (!permissionId) continue;
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId } },
        update: {},
        create: { roleId: role.id, permissionId },
      });
    }
  }
  const roleByName = new Map((await prisma.role.findMany()).map((r) => [r.name, r]));

  // 3) Organization (multi-tenant root for dev)
  const org = await prisma.organization.upsert({
    where: { slug: 'futurecorp-demo' },
    update: {},
    create: {
      name: 'FutureCorp Demo College',
      slug: 'futurecorp-demo',
      type: 'COLLEGE',
      status: 'ACTIVE',
    },
  });

  // 4) Users (one per role)
  const passwordHash = await argon2.hash(DEV_PASSWORD, { type: argon2.argon2id });

  for (const u of SEED_USERS) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: {
        email: u.email,
        passwordHash,
        status: 'ACTIVE',
        emailVerifiedAt: new Date(0), // pre-verified for dev
        profile: {
          create: { firstName: u.firstName, lastName: u.lastName },
        },
      },
    });

    // Org membership (super admin is platform-level but still a member for dev)
    await prisma.organizationMember.upsert({
      where: { organizationId_userId: { organizationId: org.id, userId: user.id } },
      update: {},
      create: { organizationId: org.id, userId: user.id, isPrimary: true },
    });

    // Role assignment — SUPER_ADMIN at platform scope (org null), others org-scoped.
    // NB: nullable columns in a composite unique are treated as distinct by
    // Postgres, so upsert-by-unique is unreliable here — use find-or-create.
    const role = roleByName.get(u.role);
    if (role) {
      const organizationId = u.role === 'SUPER_ADMIN' ? null : org.id;
      const existing = await prisma.userRole.findFirst({
        where: { userId: user.id, roleId: role.id, organizationId },
      });
      if (!existing) {
        await prisma.userRole.create({
          data: { userId: user.id, roleId: role.id, organizationId },
        });
      }
    }
  }

  // 5) Feature flags for unfinished modules (§2.17) — off by default
  const flags = [
    'module.live_class',
    'module.placement',
    'module.mentorship',
    'module.community',
    'module.mock_interview',
  ];
  for (const key of flags) {
    await prisma.featureFlag.upsert({
      where: { key },
      update: {},
      create: { key, enabled: false, description: `Enables the ${key} module` },
    });
  }

  console.log(`✅ Seed complete. ${SEED_USERS.length} users, org "${org.slug}".`);
  console.log(`   Dev login password for all seed users: ${DEV_PASSWORD}`);
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
