import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UserContextService } from '../authz/user-context.service';
import { assertOrgAccess } from '../common/tenant';
import { computeAttendanceRate } from '../attendance/attendance.calc';

function dayBounds(now = new Date()) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

/**
 * Dashboard aggregation (§8, §9, §34). Uses parallel independent queries — no
 * single giant query — and returns explainable, real data.
 */
@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly userContext: UserContextService,
  ) {}

  async student(userId: string) {
    const now = new Date();
    const { start, end } = dayBounds(now);

    const batchLinks = await this.prisma.batchStudent.findMany({
      where: { userId, status: 'ACTIVE' },
      select: { batchId: true },
    });
    const batchIds = batchLinks.map((b) => b.batchId);

    const [enrollments, upcomingSessions, todaySessions, attendanceRecords] = await Promise.all([
      this.prisma.enrollment.findMany({
        where: { userId, status: 'ACTIVE' },
        include: {
          course: { select: { id: true, title: true, level: true, status: true } },
          batch: { select: { id: true, name: true, code: true } },
          progress: true,
        },
        orderBy: { enrolledAt: 'desc' },
      }),
      batchIds.length
        ? this.prisma.batchSchedule.findMany({
            where: { batchId: { in: batchIds }, startsAt: { gte: now } },
            orderBy: { startsAt: 'asc' },
            take: 8,
            include: { batch: { select: { name: true, course: { select: { title: true } } } } },
          })
        : Promise.resolve([]),
      batchIds.length
        ? this.prisma.batchSchedule.findMany({
            where: { batchId: { in: batchIds }, startsAt: { gte: start, lt: end } },
            orderBy: { startsAt: 'asc' },
            include: { batch: { select: { name: true } } },
          })
        : Promise.resolve([]),
      this.prisma.attendanceRecord.findMany({
        where: { studentId: userId },
        select: { status: true },
      }),
    ]);

    const [
      pendingAssignments,
      pendingAssessments,
      recentEvaluations,
      recentAttempts,
      nextMentorSession,
      orgMemberships,
      myApplications,
      recentAttendance,
    ] = await Promise.all([
      // Published assignments in the student's batches not yet submitted
      batchIds.length
        ? this.prisma.assignment.findMany({
            where: {
              batchId: { in: batchIds },
              status: 'PUBLISHED',
              submissions: { none: { studentId: userId, status: { not: 'DRAFT' } } },
            },
            orderBy: [{ dueAt: { sort: 'asc', nulls: 'last' } }],
            take: 6,
            select: { id: true, title: true, dueAt: true, batch: { select: { name: true } } },
          })
        : Promise.resolve([]),
      // Published assessments not yet attempted (submitted/graded)
      batchIds.length
        ? this.prisma.assessment.findMany({
            where: {
              batchId: { in: batchIds },
              status: 'PUBLISHED',
              attempts: { none: { studentId: userId, status: { in: ['SUBMITTED', 'GRADED'] } } },
            },
            orderBy: [{ dueAt: { sort: 'asc', nulls: 'last' } }],
            take: 6,
            select: { id: true, title: true, dueAt: true, batch: { select: { name: true } } },
          })
        : Promise.resolve([]),
      this.prisma.assignmentEvaluation.findMany({
        where: { submission: { studentId: userId }, finalScore: { not: null } },
        orderBy: { updatedAt: 'desc' },
        take: 4,
        select: {
          finalScore: true,
          updatedAt: true,
          submission: { select: { assignment: { select: { title: true, maxScore: true } } } },
        },
      }),
      this.prisma.assessmentAttempt.findMany({
        where: { studentId: userId, status: 'GRADED', percent: { not: null } },
        orderBy: { gradedAt: 'desc' },
        take: 4,
        select: { percent: true, gradedAt: true, assessment: { select: { title: true } } },
      }),
      this.prisma.mentorBooking.findFirst({
        where: {
          studentId: userId,
          status: 'CONFIRMED',
          slot: { startsAt: { gte: now } },
        },
        orderBy: { slot: { startsAt: 'asc' } },
        select: {
          id: true,
          topic: true,
          status: true,
          slot: { select: { startsAt: true } },
          mentor: { select: { profile: { select: { firstName: true, lastName: true } } } },
        },
      }),
      this.prisma.organizationMember.findMany({
        where: { userId },
        select: { organizationId: true },
      }),
      this.prisma.application.count({ where: { studentId: userId } }),
      this.prisma.attendanceRecord.findMany({
        where: { studentId: userId },
        orderBy: { session: { sessionDate: 'desc' } },
        take: 10,
        select: { status: true, session: { select: { sessionDate: true } } },
      }),
    ]);

    const orgIds = orgMemberships
      .map((m) => m.organizationId)
      .filter((id): id is string => Boolean(id));
    const openJobs = orgIds.length
      ? await this.prisma.opportunity.count({
          where: { organizationId: { in: orgIds }, status: 'OPEN' },
        })
      : 0;

    // Merge assignment/assessment deadlines into one "due next" list.
    const deadlines = [
      ...pendingAssignments.map((a) => ({
        id: a.id,
        kind: 'ASSIGNMENT' as const,
        title: a.title,
        dueAt: a.dueAt,
        batchName: a.batch.name,
      })),
      ...pendingAssessments.map((a) => ({
        id: a.id,
        kind: 'ASSESSMENT' as const,
        title: a.title,
        dueAt: a.dueAt,
        batchName: a.batch.name,
      })),
    ]
      .sort((a, b) => {
        if (!a.dueAt) return 1;
        if (!b.dueAt) return -1;
        return a.dueAt.getTime() - b.dueAt.getTime();
      })
      .slice(0, 6);

    // Merge recent assignment + assessment grades into one feed.
    const recentGrades = [
      ...recentEvaluations.map((e) => ({
        kind: 'ASSIGNMENT' as const,
        title: e.submission.assignment.title,
        percent: Math.round(((e.finalScore ?? 0) / (e.submission.assignment.maxScore || 100)) * 100),
        at: e.updatedAt,
      })),
      ...recentAttempts.map((a) => ({
        kind: 'ASSESSMENT' as const,
        title: a.assessment.title,
        percent: a.percent ?? 0,
        at: a.gradedAt ?? new Date(0),
      })),
    ]
      .sort((a, b) => b.at.getTime() - a.at.getTime())
      .slice(0, 5);

    // Last sessions oldest→newest for the trend chart.
    const attendanceTrend = recentAttendance
      .slice()
      .reverse()
      .map((r) => ({
        date: r.session.sessionDate,
        value: r.status === 'PRESENT' ? 100 : r.status === 'LATE' ? 50 : 0,
      }));

    const attendance = computeAttendanceRate(attendanceRecords);
    const percents = enrollments.map((e) => e.progress?.percent ?? 0);
    const avgProgress = percents.length
      ? Math.round(percents.reduce((a, b) => a + b, 0) / percents.length)
      : 0;
    const completedLessons = enrollments.reduce(
      (a, e) => a + (e.progress?.completedLessons ?? 0),
      0,
    );

    const streak = await this.prisma.attendanceStreak.findUnique({ where: { userId } });
    const mapSession = <
      T extends {
        id: string;
        title: string;
        startsAt: Date;
        endsAt: Date;
        location: string | null;
        meetingUrl?: string | null;
        status?: string;
        batch: { name: string; course?: { title: string } };
      },
    >(
      s: T,
    ) => ({
      id: s.id,
      title: s.title,
      startsAt: s.startsAt,
      endsAt: s.endsAt,
      location: s.location,
      meetingUrl: s.meetingUrl ?? null,
      status: s.status ?? 'SCHEDULED',
      batch: s.batch,
    });

    return {
      stats: {
        activeCourses: enrollments.filter((e) => e.status === 'ACTIVE').length,
        avgProgress,
        completedLessons,
        upcomingSessions: upcomingSessions.length,
        attendanceRate: attendance.rate,
        pendingDeadlines: deadlines.length,
        openJobs,
        myApplications,
        attendanceStreak: streak?.currentStreak ?? 0,
        longestStreak: streak?.longestStreak ?? 0,
      },
      enrollments,
      todaySessions: todaySessions.map(mapSession),
      upcomingSessions: upcomingSessions.map(mapSession),
      deadlines,
      recentGrades,
      attendanceTrend,
      nextLiveClass: (() => {
        const raw =
          upcomingSessions.find(
            (s) => Boolean(s.meetingUrl) && s.status !== 'ENDED' && s.status !== 'CANCELLED',
          ) ??
          todaySessions.find(
            (s) => Boolean(s.meetingUrl) && (s.status === 'LIVE' || s.status === 'SCHEDULED'),
          ) ??
          null;
        return raw ? mapSession(raw) : null;
      })(),
      nextMentorSession: nextMentorSession
        ? {
            id: nextMentorSession.id,
            topic: nextMentorSession.topic,
            scheduledAt: nextMentorSession.slot.startsAt,
            status: nextMentorSession.status,
            meetingUrl: null as string | null,
            mentor: nextMentorSession.mentor,
          }
        : null,
    };
  }

  async trainer(userId: string) {
    const now = new Date();
    const { start } = dayBounds(now);

    const trainerBatches = await this.prisma.batchTrainer.findMany({
      where: { userId },
      include: {
        batch: {
          include: {
            course: { select: { id: true, title: true } },
            _count: { select: { students: true } },
          },
        },
      },
    });
    const batchIds = trainerBatches.map((t) => t.batchId);

    const [enrollments, upcomingSessions] = await Promise.all([
      batchIds.length
        ? this.prisma.enrollment.findMany({
            where: { batchId: { in: batchIds }, status: 'ACTIVE' },
            select: { batchId: true, progress: { select: { percent: true } } },
          })
        : Promise.resolve([]),
      batchIds.length
        ? this.prisma.batchSchedule.findMany({
            where: { batchId: { in: batchIds }, startsAt: { gte: start } },
            orderBy: { startsAt: 'asc' },
            take: 10,
            include: { batch: { select: { name: true, course: { select: { title: true } } } } },
          })
        : Promise.resolve([]),
    ]);

    const byBatch = new Map<string, { sum: number; count: number }>();
    for (const e of enrollments) {
      const agg = byBatch.get(e.batchId!) ?? { sum: 0, count: 0 };
      agg.sum += e.progress?.percent ?? 0;
      agg.count += 1;
      byBatch.set(e.batchId!, agg);
    }

    const batches = trainerBatches.map((t) => {
      const agg = byBatch.get(t.batchId);
      return {
        id: t.batch.id,
        name: t.batch.name,
        code: t.batch.code,
        status: t.batch.status,
        role: t.role,
        courseTitle: t.batch.course.title,
        studentCount: t.batch._count.students,
        avgProgress: agg && agg.count ? Math.round(agg.sum / agg.count) : 0,
      };
    });

    const totalStudents = batches.reduce((a, b) => a + b.studentCount, 0);
    const avgProgress = batches.length
      ? Math.round(batches.reduce((a, b) => a + b.avgProgress, 0) / batches.length)
      : 0;

    return {
      stats: { totalBatches: batches.length, totalStudents, avgProgress },
      batches,
      upcomingSessions,
    };
  }

  async placement(userId: string, organizationId: string) {
    await assertOrgAccess(this.userContext, userId, organizationId);

    const [openings, applications, placed, lookingRows] = await Promise.all([
      this.prisma.opportunity.findMany({
        where: { organizationId },
        orderBy: { createdAt: 'desc' },
        take: 20,
        include: { _count: { select: { applications: true } } },
      }),
      this.prisma.application.findMany({
        where: { opportunity: { organizationId } },
        select: { status: true },
      }),
      this.prisma.application.count({
        where: { opportunity: { organizationId }, status: 'HIRED' },
      }),
      this.prisma.careerProfile.findMany({
        where: {
          openToWork: true,
          user: { orgMemberships: { some: { organizationId } } },
        },
        select: { userId: true },
      }),
    ]);

    const funnel: Record<string, number> = {
      APPLIED: 0,
      UNDER_REVIEW: 0,
      SHORTLISTED: 0,
      INTERVIEW: 0,
      OFFERED: 0,
      HIRED: 0,
      REJECTED: 0,
      WITHDRAWN: 0,
    };
    for (const a of applications) {
      funnel[a.status] = (funnel[a.status] ?? 0) + 1;
    }

    const totalApps = applications.length;
    const placementRate = totalApps ? Math.round((placed / totalApps) * 100) : 0;
    const openCount = openings.filter((j) => j.status === 'OPEN').length;

    return {
      stats: {
        openJobs: openCount,
        totalJobs: openings.length,
        totalApplications: totalApps,
        placed,
        placementRate,
        studentsLooking: lookingRows.length,
      },
      funnel,
      recentJobs: openings.map((j) => ({
        id: j.id,
        title: j.title,
        companyName: j.companyName,
        status: j.status,
        _count: j._count,
      })),
    };
  }

  async admin(userId: string, organizationId: string) {
    await assertOrgAccess(this.userContext, userId, organizationId);

    const [
      memberCount,
      courseCount,
      batchCount,
      activeBatches,
      enrollments,
      attendanceRecords,
      openJobs,
      placed,
    ] = await Promise.all([
      this.prisma.organizationMember.count({ where: { organizationId } }),
      this.prisma.course.count({ where: { organizationId } }),
      this.prisma.batch.count({ where: { organizationId } }),
      this.prisma.batch.findMany({
        where: { organizationId, status: 'ACTIVE' },
        include: {
          course: { select: { title: true } },
          _count: { select: { students: true } },
        },
        take: 15,
      }),
      this.prisma.enrollment.findMany({
        where: { course: { organizationId }, status: 'ACTIVE' },
        select: { progress: { select: { percent: true } } },
      }),
      this.prisma.attendanceRecord.findMany({
        where: { session: { batch: { organizationId } } },
        select: { status: true },
      }),
      this.prisma.opportunity.count({ where: { organizationId, status: 'OPEN' } }),
      this.prisma.application.count({
        where: { opportunity: { organizationId }, status: 'HIRED' },
      }),
    ]);

    const percents = enrollments.map((e) => e.progress?.percent ?? 0);
    const avgProgress = percents.length
      ? Math.round(percents.reduce((a, b) => a + b, 0) / percents.length)
      : 0;
    const attendance = computeAttendanceRate(attendanceRecords);

    return {
      stats: {
        members: memberCount,
        courses: courseCount,
        batches: batchCount,
        activeStudents: enrollments.length,
        avgProgress,
        attendanceRate: attendance.rate,
        openJobs,
        placed,
      },
      activeBatches: activeBatches.map((b) => ({
        id: b.id,
        name: b.name,
        code: b.code,
        courseTitle: b.course.title,
        studentCount: b._count.students,
      })),
    };
  }
}
