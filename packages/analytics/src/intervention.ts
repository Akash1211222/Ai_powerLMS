import type { PrismaClient } from '@fca/database';
import type { RiskEvaluation } from './risk-evaluate';

const ACTIVE_STATUSES = ['OPEN', 'PLAN_READY', 'IN_PROGRESS'] as const;

export interface EnsureInterventionResult {
  created: boolean;
  interventionId: string | null;
  reason?: string;
}

/**
 * Creates a StudentIntervention for a meaningful HIGH/CRITICAL risk escalation
 * (§19). Idempotent (§37): a student has at most one active intervention — a
 * re-fired event or overlapping sweep never duplicates it. Plan generation and
 * notifications are the caller's concern (API vs worker differ there).
 */
export async function ensureInterventionForRisk(
  prisma: PrismaClient,
  evaluation: RiskEvaluation,
): Promise<EnsureInterventionResult> {
  if (!evaluation.changed || (evaluation.level !== 'HIGH' && evaluation.level !== 'CRITICAL')) {
    return { created: false, interventionId: null, reason: 'not_applicable' };
  }

  const active = await prisma.studentIntervention.findFirst({
    where: { userId: evaluation.userId, status: { in: [...ACTIVE_STATUSES] } },
    select: { id: true },
  });
  if (active) return { created: false, interventionId: active.id, reason: 'active_exists' };

  const snapshot = await prisma.studentRiskSnapshot.findFirst({
    where: { userId: evaluation.userId },
    orderBy: { detectedAt: 'desc' },
    select: { id: true },
  });

  const reason = evaluation.factors
    .slice(0, 3)
    .map((f) => f.label)
    .join(', ');

  const intervention = await prisma.studentIntervention.create({
    data: {
      userId: evaluation.userId,
      batchId: evaluation.batchId,
      riskSnapshotId: snapshot?.id ?? null,
      status: 'OPEN',
      reason: reason || 'Multiple risk signals detected',
      riskLevel: evaluation.level,
      riskScore: evaluation.score,
    },
  });
  return { created: true, interventionId: intervention.id };
}
