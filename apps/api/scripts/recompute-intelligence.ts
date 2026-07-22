/**
 * Recomputes the Phase 2 intelligence layer for every active student:
 * skill matrix → performance scores → risk snapshots.
 *
 * The demo seeder can't do this itself — @fca/analytics depends on
 * @fca/database, so the reverse import would be a cycle. It lives here, where
 * both packages are available.
 *
 *   pnpm db:demo:intelligence
 *
 * Also useful as an ops tool after a bulk import or a scoring-rule change:
 * every computation is deterministic and idempotent, so re-running is safe.
 */
import { prisma } from '@fca/database';
import {
  ensureSkillTaxonomy,
  recomputeStudentSkills,
  computeAndStoreStudentScore,
  evaluateStudentRisk,
} from '@fca/analytics';

async function main(): Promise<void> {
  console.log('🧠 Recomputing intelligence (skills → scores → risk)...');

  // The API normally seeds the taxonomy on boot; do it here so this script
  // works against a database the API has never touched.
  await ensureSkillTaxonomy(prisma);

  const students = await prisma.batchStudent.findMany({
    where: { status: 'ACTIVE' },
    select: { userId: true },
    distinct: ['userId'],
  });
  console.log(`   ${students.length} active student(s)`);

  const riskTally: Record<string, number> = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 };
  let done = 0;
  let failed = 0;

  for (const { userId } of students) {
    try {
      await recomputeStudentSkills(prisma, userId);
      await computeAndStoreStudentScore(prisma, userId);
      const risk = await evaluateStudentRisk(prisma, userId);
      riskTally[risk.level] = (riskTally[risk.level] ?? 0) + 1;
      done++;
      if (done % 25 === 0) console.log(`   …${done}/${students.length}`);
    } catch (err) {
      // One bad student shouldn't abort the whole run.
      failed++;
      console.error(`   ✗ ${userId}: ${(err as Error).message}`);
    }
  }

  console.log(`✅ Recomputed ${done} student(s)${failed ? `, ${failed} failed` : ''}`);
  console.log(
    `   Risk spread — LOW ${riskTally.LOW} · MEDIUM ${riskTally.MEDIUM} · HIGH ${riskTally.HIGH} · CRITICAL ${riskTally.CRITICAL}`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
