import type { PrismaClient } from '@fca/database';
import type { AIProvider } from './provider';
import { HeuristicProvider } from './heuristic-provider';
import { getProvider } from './factory';
import type { RecoveryPlanInput } from './recovery-schema';

const DAY_MS = 86400000;

export interface RecoveryPlanResult {
  skipped: boolean;
  reason?: string;
  planId?: string;
  taskCount?: number;
  followUpAt?: Date;
}

/**
 * Generates + stores the recovery plan for an intervention (§19, §36).
 * Idempotent: an intervention gets exactly one plan — re-runs are skipped.
 * Deterministic heuristic fallback on any provider failure, so the workflow
 * always completes. Writes an AIJob observability row.
 */
export async function runRecoveryPlanGeneration(
  prisma: PrismaClient,
  interventionId: string,
  provider: AIProvider = getProvider(),
): Promise<RecoveryPlanResult> {
  const intervention = await prisma.studentIntervention.findUnique({
    where: { id: interventionId },
    include: { plan: { select: { id: true } } },
  });
  if (!intervention) return { skipped: true, reason: 'not_found' };
  if (intervention.plan) {
    return { skipped: true, reason: 'already_generated', planId: intervention.plan.id };
  }

  const [snapshot, weakSkills, batch] = await Promise.all([
    intervention.riskSnapshotId
      ? prisma.studentRiskSnapshot.findUnique({ where: { id: intervention.riskSnapshotId } })
      : Promise.resolve(null),
    prisma.studentSkill.findMany({
      where: { userId: intervention.userId, score: { lt: 60 } },
      orderBy: { score: 'asc' },
      take: 5,
      include: { skill: { select: { name: true } } },
    }),
    intervention.batchId
      ? prisma.batch.findUnique({
          where: { id: intervention.batchId },
          include: { course: { select: { title: true } } },
        })
      : Promise.resolve(null),
  ]);

  const rawFactors = (snapshot?.factors ?? []) as Array<{
    code?: string;
    label?: string;
    detail?: string;
  }>;
  const input: RecoveryPlanInput = {
    riskLevel: intervention.riskLevel,
    riskScore: intervention.riskScore,
    factors: rawFactors.map((f) => ({
      code: f.code,
      label: f.label ?? 'Signal',
      detail: f.detail ?? '',
    })),
    weakSkills: weakSkills.map((s) => ({ name: s.skill.name, score: s.score })),
    courseTitle: batch?.course.title ?? null,
  };

  const started = Date.now();
  let used: AIProvider = provider;
  let output;
  try {
    output = await provider.generateRecoveryPlan(input);
  } catch {
    used = new HeuristicProvider();
    output = await used.generateRecoveryPlan(input);
  }
  const latencyMs = Date.now() - started;
  const followUpAt = new Date(Date.now() + output.followUpDays * DAY_MS);

  const plan = await prisma.$transaction(async (tx) => {
    const created = await tx.recoveryPlan.create({
      data: {
        interventionId,
        summary: output.summary,
        weakSkills: input.weakSkills.map((w) => w.name),
        mentorActions: output.mentorActions,
        trainerActions: output.trainerActions,
        provider: used.name,
        model: used.model,
        tasks: {
          create: output.tasks.map((t, i) => ({
            title: t.title,
            detail: t.detail || null,
            order: i,
          })),
        },
      },
    });
    await tx.studentIntervention.update({
      where: { id: interventionId },
      data: { status: 'PLAN_READY', followUpAt },
    });
    await tx.aIJob.create({
      data: {
        type: 'RECOVERY_PLAN',
        status: 'COMPLETED',
        provider: used.name,
        model: used.model,
        inputRef: interventionId,
        output: output as unknown as object,
        latencyMs,
      },
    });
    return created;
  });

  return { skipped: false, planId: plan.id, taskCount: output.tasks.length, followUpAt };
}
