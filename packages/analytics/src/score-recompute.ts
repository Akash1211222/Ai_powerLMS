import type { PrismaClient } from '@fca/database';
import { SCORE_CALC_VERSION } from '@fca/shared';
import { computeScores, type ScoreInputs } from './score';

function attendanceRate(records: Array<{ status: string }>): number {
  let present = 0;
  let excused = 0;
  for (const r of records) {
    if (r.status === 'PRESENT' || r.status === 'LATE') present++;
    else if (r.status === 'EXCUSED') excused++;
  }
  const countable = records.length - excused;
  return countable > 0 ? Math.round((present / countable) * 100) : 0;
}

/**
 * Gathers a student's real signals (§17) and stores their composite scores with
 * an explainable component breakdown. Shared by API/worker/seed; idempotent.
 */
export async function computeAndStoreStudentScore(
  prisma: PrismaClient,
  userId: string,
): Promise<StudentScoreResult> {
  const [attempts, evaluatedSubs, enrollments, attendance, skills, batchLinks] = await Promise.all([
    prisma.assessmentAttempt.findMany({
      where: { studentId: userId, status: 'GRADED' },
      select: { percent: true },
    }),
    prisma.assignmentSubmission.findMany({
      where: { studentId: userId, evaluation: { status: 'RELEASED' } },
      select: { evaluation: { select: { finalScore: true } }, assignment: { select: { maxScore: true } } },
    }),
    prisma.enrollment.findMany({
      where: { userId, status: 'ACTIVE' },
      select: { progress: { select: { percent: true } } },
    }),
    prisma.attendanceRecord.findMany({ where: { studentId: userId }, select: { status: true } }),
    prisma.studentSkill.findMany({ where: { userId }, select: { score: true, confidence: true } }),
    prisma.batchStudent.findMany({
      where: { userId, status: 'ACTIVE' },
      select: { batchId: true },
    }),
  ]);

  const batchIds = batchLinks.map((b) => b.batchId);
  const [publishedAssignments, submittedCount] = await Promise.all([
    batchIds.length
      ? prisma.assignment.count({ where: { batchId: { in: batchIds }, status: 'PUBLISHED' } })
      : Promise.resolve(0),
    prisma.assignmentSubmission
      .findMany({ where: { studentId: userId }, select: { assignmentId: true }, distinct: ['assignmentId'] })
      .then((r) => r.length),
  ]);

  const inputs: ScoreInputs = {
    assessmentPercents: attempts.map((a) => a.percent ?? 0),
    assignmentPercents: evaluatedSubs.map((s) =>
      s.assignment.maxScore > 0
        ? Math.round(((s.evaluation?.finalScore ?? 0) / s.assignment.maxScore) * 100)
        : 0,
    ),
    avgCourseProgress: enrollments.length
      ? Math.round(enrollments.reduce((a, e) => a + (e.progress?.percent ?? 0), 0) / enrollments.length)
      : 0,
    submissionRate: publishedAssignments > 0 ? Math.min(1, submittedCount / publishedAssignments) : 1,
    attendanceRate: attendanceRate(attendance),
    skillScores: skills,
  };

  const scores = computeScores(inputs);
  await prisma.studentScore.upsert({
    where: { userId },
    update: { ...toRow(scores), calcVersion: SCORE_CALC_VERSION, computedAt: new Date() },
    create: { userId, ...toRow(scores), calcVersion: SCORE_CALC_VERSION },
  });
  return { userId, ...scores };
}

function toRow(s: ReturnType<typeof computeScores>) {
  return {
    performanceScore: s.performanceScore,
    engagementScore: s.engagementScore,
    consistencyScore: s.consistencyScore,
    skillMasteryScore: s.skillMasteryScore,
    overallScore: s.overallScore,
    components: s.components as object,
  };
}

export interface StudentScoreResult {
  userId: string;
  performanceScore: number;
  engagementScore: number;
  consistencyScore: number;
  skillMasteryScore: number;
  overallScore: number;
  components: Record<string, unknown>;
}
