import type { PrismaClient } from '@fca/database';
import type { AIProvider } from './provider';
import { HeuristicProvider } from './heuristic-provider';
import { getProvider } from './factory';
import type { ProgressReportInput } from './report-schema';

const DAY_MS = 86400000;

export interface WeeklyReportResult {
  skipped: boolean;
  reason?: string;
  reportId?: string;
  periodStart?: Date;
}

/** Truncates to the start of the day (00:00 local). */
function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/**
 * Generates + stores one weekly progress report (§21). Deterministic metrics
 * are gathered here; the provider only narrates them. Idempotent per
 * (student, week) via the unique constraint. Heuristic fallback on failure.
 * Shared by the API (manual) and the worker (scheduled).
 */
export async function runWeeklyReport(
  prisma: PrismaClient,
  userId: string,
  periodStartInput?: Date,
  provider: AIProvider = getProvider(),
): Promise<WeeklyReportResult> {
  const periodEnd = periodStartInput ? new Date(periodStartInput.getTime() + 7 * DAY_MS) : new Date();
  const periodStart = startOfDay(periodStartInput ?? new Date(Date.now() - 7 * DAY_MS));

  const existing = await prisma.weeklyProgressReport.findUnique({
    where: { userId_periodStart: { userId, periodStart } },
    select: { id: true },
  });
  if (existing) return { skipped: true, reason: 'already_generated', reportId: existing.id };

  const range = { gte: periodStart, lt: periodEnd };
  const [
    user,
    attendance,
    lessonsCompleted,
    submissions,
    attempts,
    recoveryTasks,
    score,
    skills,
    latestRisk,
  ] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, include: { profile: true } }),
    prisma.attendanceRecord.findMany({
      where: { studentId: userId, session: { sessionDate: range } },
      select: { status: true },
    }),
    prisma.lessonProgress.count({ where: { userId, status: 'COMPLETED', completedAt: range } }),
    prisma.assignmentSubmission.count({ where: { studentId: userId, submittedAt: range } }),
    prisma.assessmentAttempt.findMany({
      where: { studentId: userId, status: 'GRADED', submittedAt: range },
      select: { percent: true },
    }),
    prisma.recoveryPlanTask.count({
      where: { completedAt: range, plan: { intervention: { userId } } },
    }),
    prisma.studentScore.findUnique({ where: { userId }, select: { overallScore: true } }),
    prisma.studentSkill.findMany({
      where: { userId },
      include: { skill: { select: { name: true } } },
    }),
    prisma.studentRiskSnapshot.findFirst({
      where: { userId },
      orderBy: { detectedAt: 'desc' },
      select: { level: true },
    }),
  ]);
  if (!user) return { skipped: true, reason: 'user_not_found' };

  let present = 0;
  let excused = 0;
  for (const r of attendance) {
    if (r.status === 'PRESENT' || r.status === 'LATE') present++;
    else if (r.status === 'EXCUSED') excused++;
  }
  const countable = attendance.length - excused;
  const attendanceRate = countable > 0 ? Math.round((present / countable) * 100) : 0;
  const quizAvg = attempts.length
    ? Math.round(attempts.reduce((a, x) => a + (x.percent ?? 0), 0) / attempts.length)
    : null;

  const studentName = user.profile ? `${user.profile.firstName} ${user.profile.lastName}` : user.email;
  const periodLabel = `week of ${periodStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;

  const input: ProgressReportInput = {
    studentName,
    periodLabel,
    metrics: {
      attendanceRate,
      sessionsAttended: present,
      sessionsTotal: attendance.length,
      lessonsCompleted,
      assignmentsSubmitted: submissions,
      quizzesTaken: attempts.length,
      quizAvg,
      overallScore: score?.overallScore ?? null,
      recoveryTasksCompleted: recoveryTasks,
    },
    skillTrends: skills
      .filter((s) => s.trend === 'UP' || s.trend === 'DOWN')
      .map((s) => ({ name: s.skill.name, trend: s.trend, score: s.score })),
    weakSkills: skills
      .filter((s) => s.score < 60)
      .sort((a, b) => a.score - b.score)
      .slice(0, 5)
      .map((s) => ({ name: s.skill.name, score: s.score })),
    riskLevel: latestRisk?.level ?? null,
  };

  const started = Date.now();
  let used: AIProvider = provider;
  let output;
  try {
    output = await provider.generateProgressReport(input);
  } catch {
    used = new HeuristicProvider();
    output = await used.generateProgressReport(input);
  }
  const latencyMs = Date.now() - started;

  const report = await prisma.$transaction(async (tx) => {
    const created = await tx.weeklyProgressReport.create({
      data: {
        userId,
        periodStart,
        periodEnd,
        summary: output.summary,
        achievements: output.achievements,
        improvements: output.improvements,
        weakAreas: output.weakAreas,
        nextWeekGoals: output.nextWeekGoals,
        trainerNote: output.trainerNote,
        mentorNote: output.mentorNote,
        metrics: input.metrics as unknown as object,
        provider: used.name,
        model: used.model,
      },
    });
    await tx.aIJob.create({
      data: {
        type: 'PROGRESS_REPORT',
        status: 'COMPLETED',
        provider: used.name,
        model: used.model,
        inputRef: created.id,
        output: output as unknown as object,
        latencyMs,
      },
    });
    return created;
  });

  return { skipped: false, reportId: report.id, periodStart };
}
