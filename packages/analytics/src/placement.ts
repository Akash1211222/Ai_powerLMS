import type { PrismaClient } from '@fca/database';

export const PLACEMENT_READINESS_VERSION = 1;

export type PlacementTier = 'READY' | 'NEARLY_READY' | 'DEVELOPING' | 'NOT_READY';

export interface PlacementComponents {
  skillMastery: number;
  performance: number;
  consistency: number;
  engagement: number;
  completion: number;
}

export interface PlacementCriterion {
  key: string;
  label: string;
  detail: string;
  met: boolean;
}

export interface PlacementReadiness {
  userId: string;
  readinessScore: number;
  tier: PlacementTier;
  components: PlacementComponents;
  checklist: PlacementCriterion[];
  strengths: string[];
  gaps: string[];
  version: number;
}

export interface BatchPlacementRow {
  userId: string;
  name: string;
  readinessScore: number;
  tier: PlacementTier;
}

export interface BatchPlacement {
  batchId: string;
  studentCount: number;
  avgReadiness: number;
  tierCounts: Record<PlacementTier, number>;
  students: BatchPlacementRow[];
  version: number;
}

// Component weights (sum = 1.0). Skill + performance dominate; completion is a
// meaningful gate; consistency/engagement round out job-readiness.
const WEIGHTS = { skillMastery: 0.3, performance: 0.25, consistency: 0.15, engagement: 0.1, completion: 0.2 };

function tierFor(score: number): PlacementTier {
  if (score >= 80) return 'READY';
  if (score >= 65) return 'NEARLY_READY';
  if (score >= 45) return 'DEVELOPING';
  return 'NOT_READY';
}

const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0);

/**
 * Deterministic placement readiness (§17, §24). Combines the platform's already
 * computed sub-scores (skill mastery, performance, consistency, engagement) with
 * course completion into a weighted readiness score, and derives an explainable
 * checklist → strengths/gaps (§9). No AI — the numbers are computed here, so it
 * is fast enough to serve inside a request (§46). Idempotent, side-effect free.
 */
export async function computePlacementReadiness(
  prisma: PrismaClient,
  userId: string,
): Promise<PlacementReadiness> {
  const [score, enrollments, gradedAttempts, risk] = await Promise.all([
    prisma.studentScore.findUnique({ where: { userId } }),
    prisma.enrollment.findMany({
      where: { userId, status: 'ACTIVE' },
      select: { progress: { select: { percent: true } } },
    }),
    prisma.assessmentAttempt.findMany({
      where: { studentId: userId, status: 'GRADED' },
      select: { percent: true, assessment: { select: { passingScore: true } } },
    }),
    prisma.studentRiskSnapshot.findFirst({
      where: { userId },
      orderBy: { detectedAt: 'desc' },
      select: { level: true },
    }),
  ]);

  const components: PlacementComponents = {
    skillMastery: score?.skillMasteryScore ?? 0,
    performance: score?.performanceScore ?? 0,
    consistency: score?.consistencyScore ?? 0,
    engagement: score?.engagementScore ?? 0,
    completion: avg(enrollments.map((e) => e.progress?.percent ?? 0)),
  };

  const readinessScore = Math.round(
    WEIGHTS.skillMastery * components.skillMastery +
      WEIGHTS.performance * components.performance +
      WEIGHTS.consistency * components.consistency +
      WEIGHTS.engagement * components.engagement +
      WEIGHTS.completion * components.completion,
  );

  const passedAssessments = gradedAttempts.filter(
    (a) => (a.percent ?? 0) >= (a.assessment.passingScore ?? 60),
  ).length;
  const riskElevated = risk?.level === 'HIGH' || risk?.level === 'CRITICAL';

  const checklist: PlacementCriterion[] = [
    { key: 'skills', label: 'Skill mastery ≥ 70%', detail: `Currently ${components.skillMastery}%`, met: components.skillMastery >= 70 },
    { key: 'performance', label: 'Performance ≥ 65%', detail: `Currently ${components.performance}%`, met: components.performance >= 65 },
    { key: 'completion', label: 'Course completion ≥ 80%', detail: `Currently ${components.completion}%`, met: components.completion >= 80 },
    { key: 'consistency', label: 'Consistency ≥ 75%', detail: `Currently ${components.consistency}%`, met: components.consistency >= 75 },
    { key: 'assessments', label: 'Passed at least 3 assessments', detail: `${passedAssessments} passed`, met: passedAssessments >= 3 },
    { key: 'risk', label: 'Not currently at risk', detail: riskElevated ? `Risk is ${risk?.level}` : 'On track', met: !riskElevated },
  ];

  return {
    userId,
    readinessScore,
    tier: tierFor(readinessScore),
    components,
    checklist,
    strengths: checklist.filter((c) => c.met).map((c) => c.label),
    gaps: checklist.filter((c) => !c.met).map((c) => `${c.label} — ${c.detail}`),
    version: PLACEMENT_READINESS_VERSION,
  };
}

/**
 * Cohort placement readiness for a batch (§24) — the placement officer's view.
 * Reuses the per-student readiness computation and rolls it into tier counts
 * and a readiness-ranked roster.
 */
export async function computeBatchPlacement(prisma: PrismaClient, batchId: string): Promise<BatchPlacement> {
  const students = await prisma.batchStudent.findMany({
    where: { batchId, status: 'ACTIVE' },
    select: {
      userId: true,
      user: { select: { email: true, profile: { select: { firstName: true, lastName: true } } } },
    },
  });

  const tierCounts: Record<PlacementTier, number> = { READY: 0, NEARLY_READY: 0, DEVELOPING: 0, NOT_READY: 0 };
  const rows: BatchPlacementRow[] = await Promise.all(
    students.map(async (s) => {
      const r = await computePlacementReadiness(prisma, s.userId);
      const name = s.user.profile ? `${s.user.profile.firstName} ${s.user.profile.lastName}` : s.user.email;
      return { userId: s.userId, name, readinessScore: r.readinessScore, tier: r.tier };
    }),
  );
  for (const r of rows) tierCounts[r.tier] += 1;

  return {
    batchId,
    studentCount: rows.length,
    avgReadiness: avg(rows.map((r) => r.readinessScore)),
    tierCounts,
    students: rows.sort((a, b) => b.readinessScore - a.readinessScore),
    version: PLACEMENT_READINESS_VERSION,
  };
}
