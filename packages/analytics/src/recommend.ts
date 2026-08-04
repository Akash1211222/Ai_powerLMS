import type { PrismaClient } from '@fca/database';

const DAY_MS = 86400000;

export const RECOMMENDATION_VERSION = 1;

export type RecommendationType =
  | 'SUBMIT_ASSIGNMENT'
  | 'BOOK_MENTOR'
  | 'RETAKE_QUIZ'
  | 'REVIEW_SKILL'
  | 'COMPLETE_LESSON'
  | 'KEEP_GOING';

export interface Recommendation {
  type: RecommendationType;
  /** 0..100, higher = act on this first. */
  priority: number;
  title: string;
  reason: string;
  deepLink: string;
  target?: { kind: string; id: string; label: string };
}

/**
 * Deterministic "next best actions" for a student (§17, §22). Every item is
 * derived from real signals — overdue work, failed-but-retakeable quizzes, weak
 * skills, unfinished lessons, elevated risk — and carries an explainable reason
 * (§9). No AI round-trip: the personalization IS the ranking, so this is instant
 * and safe to call inside a request (§46). Idempotent and side-effect free.
 */
export async function computeRecommendations(
  prisma: PrismaClient,
  userId: string,
  limit = 6,
): Promise<Recommendation[]> {
  const now = Date.now();

  const [batchLinks, enrollments, weakSkills, attempts, riskSnapshot] = await Promise.all([
    prisma.batchStudent.findMany({ where: { userId, status: 'ACTIVE' }, select: { batchId: true } }),
    prisma.enrollment.findMany({
      where: { userId, status: 'ACTIVE' },
      select: {
        courseId: true,
        batchId: true,
        course: { select: { title: true } },
        progress: { select: { percent: true } },
      },
    }),
    prisma.studentSkill.findMany({
      where: { userId, evidenceCount: { gt: 0 }, score: { lt: 55 } },
      select: { skillId: true, score: true, skill: { select: { name: true } } },
      orderBy: { score: 'asc' },
      take: 4,
    }),
    prisma.assessmentAttempt.findMany({
      where: { studentId: userId, status: 'GRADED' },
      select: {
        percent: true,
        attemptNumber: true,
        assessment: {
          select: { id: true, title: true, status: true, passingScore: true, maxAttempts: true, batchId: true },
        },
      },
    }),
    prisma.studentRiskSnapshot.findFirst({
      where: { userId },
      orderBy: { detectedAt: 'desc' },
      select: { level: true },
    }),
  ]);

  const batchIds = batchLinks.map((b) => b.batchId);
  // Map a batch back to its course so batch-scoped work can deep-link to content.
  const courseForBatch = new Map<string, string>();
  for (const e of enrollments) if (e.batchId) courseForBatch.set(e.batchId, e.courseId);
  const courseLink = (batchId: string | null | undefined) =>
    batchId && courseForBatch.has(batchId) ? `/courses/${courseForBatch.get(batchId)}` : '/courses';

  const recs: Recommendation[] = [];

  // 1) Overdue assignments — the most time-sensitive signal.
  if (batchIds.length) {
    const overdue = await prisma.assignment.findMany({
      where: {
        batchId: { in: batchIds },
        status: 'PUBLISHED',
        dueAt: { lt: new Date(now) },
        submissions: { none: { studentId: userId } },
      },
      select: { id: true, title: true, dueAt: true, batchId: true },
      orderBy: { dueAt: 'asc' },
      take: 3,
    });
    for (const a of overdue) {
      const daysOverdue = a.dueAt ? Math.floor((now - a.dueAt.getTime()) / DAY_MS) : 0;
      recs.push({
        type: 'SUBMIT_ASSIGNMENT',
        priority: Math.min(96, 84 + daysOverdue),
        title: `Submit "${a.title}"`,
        reason: daysOverdue > 0 ? `Overdue by ${daysOverdue} day${daysOverdue === 1 ? '' : 's'}.` : 'Past its due date and not submitted.',
        deepLink: courseLink(a.batchId),
        target: { kind: 'assignment', id: a.id, label: a.title },
      });
    }
  }

  // 2) Elevated risk — nudge toward human support.
  if (riskSnapshot && (riskSnapshot.level === 'HIGH' || riskSnapshot.level === 'CRITICAL')) {
    recs.push({
      type: 'BOOK_MENTOR',
      priority: riskSnapshot.level === 'CRITICAL' ? 88 : 82,
      title: 'Meet your mentor',
      reason: `Your risk level is ${riskSnapshot.level}. A quick 1:1 can get you back on track.`,
      deepLink: '/dashboard',
    });
  }

  // 3) Failed-but-retakeable quizzes (best attempt below passing, attempts left).
  const byAssessment = new Map<
    string,
    { title: string; batchId: string; passing: number; maxAttempts: number; best: number; used: number }
  >();
  for (const at of attempts) {
    const a = at.assessment;
    if (a.status !== 'PUBLISHED') continue;
    const passing = a.passingScore ?? 60;
    const cur = byAssessment.get(a.id);
    const pct = at.percent ?? 0;
    if (cur) {
      cur.best = Math.max(cur.best, pct);
      cur.used = Math.max(cur.used, at.attemptNumber);
    } else {
      byAssessment.set(a.id, { title: a.title, batchId: a.batchId, passing, maxAttempts: a.maxAttempts, best: pct, used: at.attemptNumber });
    }
  }
  for (const [id, q] of byAssessment) {
    if (q.best >= q.passing || q.used >= q.maxAttempts) continue;
    recs.push({
      type: 'RETAKE_QUIZ',
      priority: Math.max(55, 80 - Math.round(q.best / 4)),
      title: `Retake "${q.title}"`,
      reason: `Your best score is ${q.best}% (pass ${q.passing}%) — you still have attempts left.`,
      deepLink: courseLink(q.batchId),
      target: { kind: 'assessment', id, label: q.title },
    });
  }

  // 4) Weak skills — steady, lower-urgency improvement.
  for (const s of weakSkills.slice(0, 2)) {
    recs.push({
      type: 'REVIEW_SKILL',
      priority: Math.max(40, 62 - Math.round(s.score / 3)),
      title: `Strengthen ${s.skill.name}`,
      reason: `Mastery is ${s.score}%. Review the lessons and practice to raise it.`,
      deepLink: '/skills',
      target: { kind: 'skill', id: s.skillId, label: s.skill.name },
    });
  }

  // 5) The next unfinished lesson in the course that needs the most push.
  const inProgress = enrollments
    .filter((e) => (e.progress?.percent ?? 0) < 100)
    .sort((a, b) => (a.progress?.percent ?? 0) - (b.progress?.percent ?? 0));
  const focus = inProgress[0];
  if (focus) {
    const lessons = await prisma.lesson.findMany({
      where: { module: { courseId: focus.courseId } },
      select: {
        id: true,
        title: true,
        progress: { where: { userId }, select: { status: true } },
      },
      orderBy: [{ module: { order: 'asc' } }, { order: 'asc' }],
    });
    const next = lessons.find((l) => (l.progress[0]?.status ?? 'NOT_STARTED') !== 'COMPLETED');
    if (next) {
      const started = next.progress[0]?.status === 'IN_PROGRESS';
      recs.push({
        type: 'COMPLETE_LESSON',
        priority: started ? 58 : 48,
        title: `${started ? 'Continue' : 'Start'} "${next.title}"`,
        reason: `Next up in ${focus.course.title}.`,
        deepLink: `/courses/${focus.courseId}`,
        target: { kind: 'lesson', id: next.id, label: next.title },
      });
    }
  }

  // 6) Nothing pressing — keep the momentum.
  if (recs.length === 0) {
    recs.push({
      type: 'KEEP_GOING',
      priority: 15,
      title: 'You’re all caught up 🎉',
      reason: 'No urgent tasks. Keep your streak going by exploring the next module.',
      deepLink: '/courses',
    });
  }

  return recs.sort((a, b) => b.priority - a.priority).slice(0, limit);
}
