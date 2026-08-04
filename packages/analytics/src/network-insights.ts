import type { PrismaClient } from '@fca/database';

export const NETWORK_INSIGHTS_VERSION = 1;

export interface NetworkInsights {
  organizationId: string;
  learning: {
    activeStudents: number;
    activeBatches: number;
    avgAttendance: number;
    avgOverallScore: number;
    atRiskCount: number;
  };
  career: {
    openOpportunities: number;
    applications: number;
    applicants: number;
    hires: number;
    /** % of students who applied and were hired. */
    placementRate: number;
    mentoringSessions: number;
    alumni: number;
  };
  community: {
    questions: number;
    answers: number;
    /** % of questions with an accepted answer. */
    answeredRate: number;
    referrals: number;
    activeContributors: number;
  };
  highlights: Array<{ label: string; value: string; detail: string }>;
  version: number;
}

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);
const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0);

/**
 * Organization-wide network insights (§33). A deterministic rollup of what the
 * whole ecosystem produced — learning, career outcomes and community activity —
 * so leaders can see the compounding value rather than isolated metrics (§17).
 * Every number is a plain count or ratio; nothing is inferred or predicted.
 */
export async function computeNetworkInsights(
  prisma: PrismaClient,
  organizationId: string,
): Promise<NetworkInsights> {
  const [members, students, activeBatches, opportunities, alumni, questions] = await Promise.all([
    prisma.organizationMember.findMany({ where: { organizationId }, select: { userId: true } }),
    prisma.batchStudent.findMany({
      where: { status: 'ACTIVE', batch: { organizationId } },
      select: { userId: true },
      distinct: ['userId'],
    }),
    prisma.batch.count({ where: { organizationId, status: 'ACTIVE' } }),
    prisma.opportunity.count({ where: { organizationId, status: 'OPEN' } }),
    prisma.alumniProfile.count({
      where: {
        isPublished: true,
        user: { orgMemberships: { some: { organizationId } } },
      },
    }),
    prisma.communityQuestion.findMany({
      where: { organizationId },
      select: { id: true, status: true },
    }),
  ]);

  const memberIds = members.map((m) => m.userId);
  const studentIds = students.map((s) => s.userId);

  const [attendance, scores, risks, applications, mentoring, answers, referrals] = await Promise.all([
    studentIds.length
      ? prisma.attendanceRecord.findMany({
          where: { studentId: { in: studentIds }, session: { batch: { organizationId } } },
          select: { studentId: true, status: true },
        })
      : Promise.resolve([]),
    studentIds.length
      ? prisma.studentScore.findMany({
          where: { userId: { in: studentIds } },
          select: { overallScore: true },
        })
      : Promise.resolve([]),
    studentIds.length
      ? prisma.studentRiskSnapshot.findMany({
          where: { userId: { in: studentIds } },
          orderBy: { detectedAt: 'desc' },
          select: { userId: true, level: true },
        })
      : Promise.resolve([]),
    prisma.application.findMany({
      where: { opportunity: { organizationId } },
      select: { studentId: true, status: true },
    }),
    memberIds.length
      ? prisma.mentorBooking.count({
          where: { status: 'COMPLETED', mentorId: { in: memberIds } },
        })
      : Promise.resolve(0),
    prisma.communityAnswer.findMany({
      where: { question: { organizationId } },
      select: { authorId: true },
    }),
    prisma.referral.findMany({
      where: { opportunity: { organizationId }, status: { not: 'DECLINED' } },
      select: { referrerId: true },
    }),
  ]);

  // Attendance per student (LATE counts as present; EXCUSED excluded).
  const byStudent = new Map<string, { present: number; countable: number }>();
  for (const r of attendance) {
    if (r.status === 'EXCUSED') continue;
    const cur = byStudent.get(r.studentId) ?? { present: 0, countable: 0 };
    cur.countable += 1;
    if (r.status === 'PRESENT' || r.status === 'LATE') cur.present += 1;
    byStudent.set(r.studentId, cur);
  }
  const avgAttendance = avg(
    [...byStudent.values()].map((a) => (a.countable > 0 ? Math.round((a.present / a.countable) * 100) : 0)),
  );

  // Latest risk per student — the desc order means first seen wins.
  const latestRisk = new Map<string, string>();
  for (const r of risks) if (!latestRisk.has(r.userId)) latestRisk.set(r.userId, r.level);
  const atRiskCount = [...latestRisk.values()].filter((l) => l === 'HIGH' || l === 'CRITICAL').length;

  const applicants = new Set(applications.map((a) => a.studentId)).size;
  const hires = applications.filter((a) => a.status === 'HIRED').length;

  const answeredQuestions = questions.filter((q) => q.status === 'ANSWERED').length;

  // Anyone who answered, referred or mentored is an active contributor.
  const contributors = new Set<string>([...answers.map((a) => a.authorId), ...referrals.map((r) => r.referrerId)]);

  const learning = {
    activeStudents: studentIds.length,
    activeBatches,
    avgAttendance,
    avgOverallScore: avg(scores.map((s) => s.overallScore)),
    atRiskCount,
  };
  const career = {
    openOpportunities: opportunities,
    applications: applications.length,
    applicants,
    hires,
    placementRate: pct(hires, applicants),
    mentoringSessions: mentoring,
    alumni,
  };
  const community = {
    questions: questions.length,
    answers: answers.length,
    answeredRate: pct(answeredQuestions, questions.length),
    referrals: referrals.length,
    activeContributors: contributors.size,
  };

  // Plain-language callouts — each one restates a number above, never a new claim.
  const highlights: Array<{ label: string; value: string; detail: string }> = [
    {
      label: 'Community answer rate',
      value: `${community.answeredRate}%`,
      detail: `${answeredQuestions} of ${community.questions} question(s) have an accepted answer.`,
    },
    {
      label: 'Network contributors',
      value: String(community.activeContributors),
      detail: `Members who answered, referred or mentored someone.`,
    },
    {
      label: 'Placement rate',
      value: `${career.placementRate}%`,
      detail: `${hires} hire(s) from ${applicants} applicant(s).`,
    },
  ];

  return {
    organizationId,
    learning,
    career,
    community,
    highlights,
    version: NETWORK_INSIGHTS_VERSION,
  };
}
