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
  ensureInterventionForRisk,
} from '@fca/analytics';
import { runRecoveryPlanGeneration, getProvider } from '@fca/ai';

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
  let interventions = 0;
  let plans = 0;
  const provider = getProvider();

  for (const { userId } of students) {
    try {
      await recomputeStudentSkills(prisma, userId);
      await computeAndStoreStudentScore(prisma, userId);
      const risk = await evaluateStudentRisk(prisma, userId);
      riskTally[risk.level] = (riskTally[risk.level] ?? 0) + 1;

      // Mirror the worker's nightly sweep: a meaningful escalation opens an
      // intervention and generates its recovery plan. Without this the at-risk
      // students have a risk level but no plan, and the workflow that the
      // student actually sees never appears.
      const opened = await ensureInterventionForRisk(prisma, risk);
      if (opened.created && opened.interventionId) {
        interventions++;
        const plan = await runRecoveryPlanGeneration(prisma, opened.interventionId, provider);
        if (!plan.skipped) plans++;
      }

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
  console.log(`   Interventions opened: ${interventions} · recovery plans generated: ${plans} (${provider.name})`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
