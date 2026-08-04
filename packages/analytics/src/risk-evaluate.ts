import type { PrismaClient } from '@fca/database';
import { RISK_RULE_VERSION } from '@fca/shared';
import { computeRisk, isMeaningfulChange, type RiskInputs, type RiskResult } from './risk';

const DAY_MS = 86400000;

export interface RiskEvaluation extends RiskResult {
  userId: string;
  batchId: string | null;
  /** True when a snapshot was written (i.e. the picture meaningfully changed). */
  changed: boolean;
  previousLevel: string | null;
}

/**
 * Evaluates one student's risk from real signals and stores a snapshot only if
 * it meaningfully changed (§18 — alerts on change, not noise). Deterministic and
 * idempotent; shared by the API (manual trigger) and the worker (scheduled sweep).
 */
export async function evaluateStudentRisk(
  prisma: PrismaClient,
  userId: string,
): Promise<RiskEvaluation> {
  const now = Date.now();

  const [batchLinks, attendance, attempts, progressRows, score, lastSnapshot] = await Promise.all([
    prisma.batchStudent.findMany({ where: { userId, status: 'ACTIVE' }, select: { batchId: true } }),
    prisma.attendanceRecord.findMany({
      where: { studentId: userId },
      select: { status: true, session: { select: { sessionDate: true } } },
      orderBy: { session: { sessionDate: 'desc' } },
      take: 50,
    }),
    prisma.assessmentAttempt.findMany({
      where: { studentId: userId, status: 'GRADED' },
      select: { percent: true, submittedAt: true },
      orderBy: { submittedAt: 'asc' },
    }),
    prisma.enrollment.findMany({
      where: { userId, status: 'ACTIVE' },
      select: { progress: { select: { lastActivityAt: true } } },
    }),
    prisma.studentScore.findUnique({ where: { userId }, select: { skillMasteryScore: true } }),
    prisma.studentRiskSnapshot.findFirst({
      where: { userId },
      orderBy: { detectedAt: 'desc' },
      select: { level: true, score: true },
    }),
  ]);

  const batchIds = batchLinks.map((b) => b.batchId);

  // Overdue = published, past due, and this student never submitted.
  const overdueAssignments = batchIds.length
    ? await prisma.assignment.count({
        where: {
          batchId: { in: batchIds },
          status: 'PUBLISHED',
          dueAt: { lt: new Date(now) },
          submissions: { none: { studentId: userId } },
        },
      })
    : 0;

  // Attendance rate (LATE counts as attended; EXCUSED excluded).
  let present = 0;
  let excused = 0;
  for (const r of attendance) {
    if (r.status === 'PRESENT' || r.status === 'LATE') present++;
    else if (r.status === 'EXCUSED') excused++;
  }
  const countable = attendance.length - excused;
  const attendanceRate = countable > 0 ? Math.round((present / countable) * 100) : 100;

  // Consecutive absences from the most recent sessions backwards.
  let consecutiveAbsences = 0;
  for (const r of attendance) {
    if (r.status === 'ABSENT') consecutiveAbsences++;
    else break;
  }

  // Assessment average + trend (last two attempts vs. the ones before).
  const percents = attempts.map((a) => a.percent ?? 0);
  const assessmentAvg = percents.length
    ? Math.round(percents.reduce((a, b) => a + b, 0) / percents.length)
    : null;
  let assessmentTrendDelta = 0;
  if (percents.length >= 3) {
    const recent = percents.slice(-2);
    const prior = percents.slice(0, -2);
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    assessmentTrendDelta = Math.round(mean(recent) - mean(prior));
  }

  // Days since the most recent learning activity.
  const activityDates = progressRows
    .map((p) => p.progress?.lastActivityAt)
    .filter((d): d is Date => Boolean(d))
    .map((d) => d.getTime());
  const lastActivity = activityDates.length ? Math.max(...activityDates) : null;
  const daysSinceLastActivity =
    lastActivity !== null ? Math.floor((now - lastActivity) / DAY_MS) : null;

  const inputs: RiskInputs = {
    attendanceRate,
    consecutiveAbsences,
    overdueAssignments,
    assessmentAvg,
    assessmentTrendDelta,
    daysSinceLastActivity,
    skillMastery: score?.skillMasteryScore ?? null,
  };

  const result = computeRisk(inputs);
  const previous = lastSnapshot ? { level: lastSnapshot.level, score: lastSnapshot.score } : null;
  const changed = isMeaningfulChange(previous, { level: result.level, score: result.score });

  if (changed) {
    await prisma.studentRiskSnapshot.create({
      data: {
        userId,
        batchId: batchIds[0] ?? null,
        level: result.level,
        score: result.score,
        factors: result.factors as unknown as object,
        recommendedActions: result.recommendedActions,
        ruleVersion: RISK_RULE_VERSION,
      },
    });
  }

  return {
    ...result,
    userId,
    batchId: batchIds[0] ?? null,
    changed,
    previousLevel: previous?.level ?? null,
  };
}
