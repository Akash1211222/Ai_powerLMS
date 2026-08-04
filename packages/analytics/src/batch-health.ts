import type { PrismaClient } from '@fca/database';
import type { RiskLevelName } from './risk';

export const BATCH_HEALTH_VERSION = 1;

export type HealthBand = 'HEALTHY' | 'WATCH' | 'AT_RISK';

export interface BatchStudentRow {
  userId: string;
  name: string;
  overallScore: number | null;
  attendanceRate: number;
  progress: number;
  skillMastery: number | null;
  riskLevel: RiskLevelName | null;
}

export interface WeakSkillRollup {
  skillId: string;
  name: string;
  avgScore: number;
  students: number;
}

export interface BatchHealth {
  batchId: string;
  studentCount: number;
  metrics: {
    avgAttendance: number;
    avgOverallScore: number;
    avgSkillMastery: number;
    avgProgress: number;
    /** % of active students whose course progress is 100. */
    completionRate: number;
  };
  riskDistribution: Record<RiskLevelName | 'UNKNOWN', number>;
  atRiskCount: number;
  /** Composite 0..100 batch health. Higher is healthier. */
  healthScore: number;
  band: HealthBand;
  topWeakSkills: WeakSkillRollup[];
  students: BatchStudentRow[];
  version: number;
}

const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0);
const clamp = (n: number) => Math.max(0, Math.min(100, n));

function bandFor(score: number): HealthBand {
  if (score >= 70) return 'HEALTHY';
  if (score >= 45) return 'WATCH';
  return 'AT_RISK';
}

/**
 * Deterministic batch health + trainer analytics (§17, §23). Rolls each active
 * student's real signals (attendance, overall score, skill mastery, course
 * progress, latest risk level) into an explainable batch picture, plus the
 * batch's weakest shared skills. No AI — the numbers are computed here and
 * returned as-is, so this is fast enough to serve inside a request (§46).
 */
export async function computeBatchHealth(prisma: PrismaClient, batchId: string): Promise<BatchHealth> {
  const batch = await prisma.batch.findUnique({ where: { id: batchId }, select: { courseId: true } });
  const courseId = batch?.courseId;

  const students = await prisma.batchStudent.findMany({
    where: { batchId, status: 'ACTIVE' },
    select: {
      userId: true,
      user: { select: { email: true, profile: { select: { firstName: true, lastName: true } } } },
    },
  });
  const userIds = students.map((s) => s.userId);

  const empty: BatchHealth = {
    batchId,
    studentCount: 0,
    metrics: { avgAttendance: 0, avgOverallScore: 0, avgSkillMastery: 0, avgProgress: 0, completionRate: 0 },
    riskDistribution: { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0, UNKNOWN: 0 },
    atRiskCount: 0,
    healthScore: 0,
    band: 'WATCH',
    topWeakSkills: [],
    students: [],
    version: BATCH_HEALTH_VERSION,
  };
  if (userIds.length === 0) return empty;

  const [attendance, scores, enrollments, riskSnapshots, skills] = await Promise.all([
    prisma.attendanceRecord.findMany({
      where: { studentId: { in: userIds }, session: { batchId } },
      select: { studentId: true, status: true },
    }),
    prisma.studentScore.findMany({
      where: { userId: { in: userIds } },
      select: { userId: true, overallScore: true, skillMasteryScore: true },
    }),
    courseId
      ? prisma.enrollment.findMany({
          where: { userId: { in: userIds }, courseId },
          select: { userId: true, progress: { select: { percent: true } } },
        })
      : Promise.resolve([] as Array<{ userId: string; progress: { percent: number } | null }>),
    prisma.studentRiskSnapshot.findMany({
      where: { userId: { in: userIds } },
      orderBy: { detectedAt: 'desc' },
      select: { userId: true, level: true },
    }),
    prisma.studentSkill.findMany({
      where: { userId: { in: userIds }, evidenceCount: { gt: 0 } },
      select: { skillId: true, score: true, skill: { select: { name: true } } },
    }),
  ]);

  // Per-student attendance rate (LATE counts as present; EXCUSED excluded).
  const attByStudent = new Map<string, { present: number; countable: number }>();
  for (const r of attendance) {
    const cur = attByStudent.get(r.studentId) ?? { present: 0, countable: 0 };
    if (r.status === 'EXCUSED') {
      // excluded from both numerator and denominator
    } else {
      cur.countable += 1;
      if (r.status === 'PRESENT' || r.status === 'LATE') cur.present += 1;
    }
    attByStudent.set(r.studentId, cur);
  }
  const rateFor = (userId: string) => {
    const a = attByStudent.get(userId);
    return a && a.countable > 0 ? Math.round((a.present / a.countable) * 100) : 0;
  };

  const scoreByUser = new Map(scores.map((s) => [s.userId, s]));
  const progressByUser = new Map(enrollments.map((e) => [e.userId, e.progress?.percent ?? 0]));
  // First occurrence wins = latest, thanks to the desc order.
  const riskByUser = new Map<string, RiskLevelName>();
  for (const r of riskSnapshots) if (!riskByUser.has(r.userId)) riskByUser.set(r.userId, r.level as RiskLevelName);

  const rows: BatchStudentRow[] = students.map((s) => {
    const sc = scoreByUser.get(s.userId);
    const name = s.user.profile
      ? `${s.user.profile.firstName} ${s.user.profile.lastName}`
      : s.user.email;
    return {
      userId: s.userId,
      name,
      overallScore: sc ? sc.overallScore : null,
      attendanceRate: rateFor(s.userId),
      progress: progressByUser.get(s.userId) ?? 0,
      skillMastery: sc ? sc.skillMasteryScore : null,
      riskLevel: riskByUser.get(s.userId) ?? null,
    };
  });

  // Aggregates: a missing score/mastery counts as 0 — a non-performing student
  // legitimately drags the batch average down.
  const metrics = {
    avgAttendance: avg(rows.map((r) => r.attendanceRate)),
    avgOverallScore: avg(rows.map((r) => r.overallScore ?? 0)),
    avgSkillMastery: avg(rows.map((r) => r.skillMastery ?? 0)),
    avgProgress: avg(rows.map((r) => r.progress)),
    completionRate: Math.round((rows.filter((r) => r.progress >= 100).length / rows.length) * 100),
  };

  const riskDistribution: Record<RiskLevelName | 'UNKNOWN', number> = {
    LOW: 0,
    MEDIUM: 0,
    HIGH: 0,
    CRITICAL: 0,
    UNKNOWN: 0,
  };
  for (const r of rows) riskDistribution[r.riskLevel ?? 'UNKNOWN'] += 1;
  const atRiskCount = riskDistribution.HIGH + riskDistribution.CRITICAL;

  const atRiskFraction = atRiskCount / rows.length;
  const base = 0.4 * metrics.avgOverallScore + 0.3 * metrics.avgAttendance + 0.3 * metrics.avgProgress;
  const healthScore = clamp(Math.round(base - atRiskFraction * 25));

  // Weakest shared skills across the batch.
  const skillAgg = new Map<string, { name: string; sum: number; count: number }>();
  for (const s of skills) {
    const cur = skillAgg.get(s.skillId) ?? { name: s.skill.name, sum: 0, count: 0 };
    cur.sum += s.score;
    cur.count += 1;
    skillAgg.set(s.skillId, cur);
  }
  const topWeakSkills: WeakSkillRollup[] = [...skillAgg.entries()]
    .map(([skillId, a]) => ({ skillId, name: a.name, avgScore: Math.round(a.sum / a.count), students: a.count }))
    .filter((w) => w.avgScore < 60)
    .sort((a, b) => a.avgScore - b.avgScore)
    .slice(0, 5);

  return {
    batchId,
    studentCount: rows.length,
    metrics,
    riskDistribution,
    atRiskCount,
    healthScore,
    band: bandFor(healthScore),
    topWeakSkills,
    students: rows.sort((a, b) => (a.overallScore ?? 0) - (b.overallScore ?? 0)),
    version: BATCH_HEALTH_VERSION,
  };
}
