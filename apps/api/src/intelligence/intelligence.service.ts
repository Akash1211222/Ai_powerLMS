import { Injectable, NotFoundException } from '@nestjs/common';
import {
  computeStudentInsight,
  emptyStudentSignals,
  enrichInsightWithLlm,
  enrichCohortBriefingWithLlm,
  type StudentInsight,
  type StudentSignals,
  type CohortBriefing,
} from '@fca/ai';
import { PrismaService } from '../prisma/prisma.service';
import { UserContextService } from '../authz/user-context.service';
import { assertOrgAccess } from '../common/tenant';
import {
  assertBatchAccess,
  resolveStudentScope,
  visibleBatchWhere,
} from '../common/student-scope';
import { computeAttendanceRate } from '../attendance/attendance.calc';

export interface StudentIntelligenceRow {
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  batches: Array<{ id: string; name: string }>;
  signals: StudentSignals;
  insight: StudentInsight;
}

/**
 * Student Intelligence (§16, §41): aggregates real academic signals
 * (attendance, assignments, assessments, progress) into explainable
 * per-student risk insights. Scores stay deterministic; Gemini narrates.
 */
@Injectable()
export class IntelligenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly userContext: UserContextService,
  ) {}

  /**
   * Staff cohort view: the active students the caller may see — their whole
   * college, or the batches they train.
   *
   * When a batch is named explicitly it is checked rather than filtered. An
   * empty list would read as "that batch has no students", which is a
   * different and untrue statement.
   */
  async cohort(callerId: string, organizationId: string, batchId?: string) {
    await assertOrgAccess(this.userContext, callerId, organizationId);
    const scope = await resolveStudentScope(this.userContext, callerId, organizationId);
    if (batchId) {
      await assertBatchAccess(this.userContext, this.prisma, callerId, {
        id: batchId,
        organizationId,
      });
    }

    const links = await this.prisma.batchStudent.findMany({
      where: {
        status: 'ACTIVE',
        batch: { organizationId, ...(batchId ? { id: batchId } : {}), ...visibleBatchWhere(scope) },
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            profile: { select: { firstName: true, lastName: true } },
          },
        },
        batch: { select: { id: true, name: true } },
      },
    });

    const byStudent = new Map<
      string,
      { user: (typeof links)[number]['user']; batches: Array<{ id: string; name: string }> }
    >();
    for (const link of links) {
      const entry = byStudent.get(link.userId) ?? { user: link.user, batches: [] };
      entry.batches.push({ id: link.batch.id, name: link.batch.name });
      byStudent.set(link.userId, entry);
    }

    const studentIds = [...byStudent.keys()];
    const signalsById = await this.collectSignals(studentIds);

    const students: StudentIntelligenceRow[] = studentIds.map((id) => {
      const entry = byStudent.get(id)!;
      const signals = signalsById.get(id)!;
      return {
        userId: id,
        firstName: entry.user.profile?.firstName ?? '',
        lastName: entry.user.profile?.lastName ?? '',
        email: entry.user.email,
        batches: entry.batches,
        signals,
        insight: computeStudentInsight(signals),
      };
    });

    students.sort((a, b) => b.insight.riskScore - a.insight.riskScore);

    const counts = { high: 0, medium: 0, low: 0 };
    let engagementSum = 0;
    for (const s of students) {
      if (s.insight.riskLevel === 'HIGH') counts.high += 1;
      else if (s.insight.riskLevel === 'MEDIUM') counts.medium += 1;
      else counts.low += 1;
      engagementSum += s.insight.engagementScore;
    }

    const stats = { total: students.length, ...counts };
    const avgEngagement = students.length ? Math.round(engagementSum / students.length) : 0;
    const avgRisk = students.length
      ? Math.round(students.reduce((a, s) => a + s.insight.riskScore, 0) / students.length)
      : 0;

    let batchName: string | undefined;
    if (batchId) {
      const batch = await this.prisma.batch.findUnique({
        where: { id: batchId },
        select: { name: true },
      });
      batchName = batch?.name;
    }

    const briefingRows = students.slice(0, 12).map((s) => ({
      name: `${s.firstName} ${s.lastName}`.trim() || s.email,
      riskLevel: s.insight.riskLevel,
      riskScore: s.insight.riskScore,
      momentum: s.insight.momentum,
      engagementScore: s.insight.engagementScore,
      interventionPriority: s.insight.interventionPriority,
      summary: s.insight.summary,
      topConcern: s.insight.concerns[0],
    }));

    const briefing: CohortBriefing = await enrichCohortBriefingWithLlm(stats, briefingRows, {
      batchName,
      organizationHint: 'FutureCorp Academy',
    });

    return {
      stats: { ...stats, avgEngagement, avgRisk },
      briefing,
      students,
    };
  }

  /** Detailed report for one student (staff view). */
  async studentReport(callerId: string, organizationId: string, studentUserId: string) {
    await assertOrgAccess(this.userContext, callerId, organizationId);

    const membership = await this.prisma.organizationMember.findFirst({
      where: { organizationId, userId: studentUserId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            profile: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });
    if (!membership) throw new NotFoundException('Student not found in this organization');

    return this.buildReport(
      {
        id: membership.user.id,
        email: membership.user.email,
        firstName: membership.user.profile?.firstName ?? '',
        lastName: membership.user.profile?.lastName ?? '',
      },
      'trainer',
    );
  }

  /** A student's own intelligence report. */
  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        profile: { select: { firstName: true, lastName: true } },
      },
    });
    if (!user) throw new NotFoundException('User not found');
    return this.buildReport(
      {
        id: user.id,
        email: user.email,
        firstName: user.profile?.firstName ?? '',
        lastName: user.profile?.lastName ?? '',
      },
      'student',
    );
  }

  private async buildReport(
    user: {
      id: string;
      firstName: string;
      lastName: string;
      email: string;
    },
    audience: 'student' | 'trainer',
  ) {
    const signalsById = await this.collectSignals([user.id]);
    const signals = signalsById.get(user.id)!;

    const [recentEvaluations, recentAttempts, batches] = await Promise.all([
      this.prisma.assignmentSubmission.findMany({
        where: { studentId: user.id, status: { in: ['EVALUATED', 'RETURNED'] } },
        orderBy: { updatedAt: 'desc' },
        take: 8,
        include: {
          assignment: { select: { id: true, title: true, maxScore: true } },
          evaluation: {
            select: { finalScore: true, trainerScore: true, aiScore: true, status: true },
          },
        },
      }),
      this.prisma.assessmentAttempt.findMany({
        where: { studentId: user.id, status: 'GRADED' },
        orderBy: { submittedAt: 'desc' },
        take: 8,
        include: { assessment: { select: { id: true, title: true } } },
      }),
      this.prisma.batchStudent.findMany({
        where: { userId: user.id, status: 'ACTIVE' },
        include: { batch: { select: { id: true, name: true } } },
      }),
    ]);

    const baseInsight = computeStudentInsight(signals);
    const insight = await enrichInsightWithLlm(signals, baseInsight, {
      studentName: `${user.firstName} ${user.lastName}`.trim() || user.email,
      audience,
      batches: batches.map((b) => b.batch.name),
    });

    return {
      student: user,
      batches: batches.map((b) => ({ id: b.batch.id, name: b.batch.name })),
      signals,
      insight,
      recentAssignments: recentEvaluations.map((s) => ({
        assignmentId: s.assignment.id,
        title: s.assignment.title,
        maxScore: s.assignment.maxScore,
        score: s.evaluation?.finalScore ?? s.evaluation?.trainerScore ?? s.evaluation?.aiScore ?? null,
        evaluationStatus: s.evaluation?.status ?? null,
        at: s.submittedAt ?? s.updatedAt,
      })),
      recentAttempts: recentAttempts.map((a) => ({
        assessmentId: a.assessment.id,
        title: a.assessment.title,
        percent: a.percent,
        at: a.submittedAt,
      })),
    };
  }

  /**
   * Batched signal collection: a fixed number of queries regardless of cohort
   * size, grouped in memory per student.
   */
  private async collectSignals(studentIds: string[]): Promise<Map<string, StudentSignals>> {
    const result = new Map<string, StudentSignals>(
      studentIds.map((id) => [id, emptyStudentSignals()]),
    );
    if (studentIds.length === 0) return result;

    const [attendance, submissions, batchLinks, attempts, enrollments] = await Promise.all([
      this.prisma.attendanceRecord.findMany({
        where: { studentId: { in: studentIds } },
        select: { studentId: true, status: true },
      }),
      this.prisma.assignmentSubmission.findMany({
        where: { studentId: { in: studentIds }, status: { not: 'DRAFT' } },
        select: {
          studentId: true,
          assignmentId: true,
          assignment: { select: { maxScore: true } },
          evaluation: { select: { finalScore: true, trainerScore: true, aiScore: true } },
        },
      }),
      this.prisma.batchStudent.findMany({
        where: { userId: { in: studentIds }, status: 'ACTIVE' },
        select: { userId: true, batchId: true },
      }),
      this.prisma.assessmentAttempt.findMany({
        where: { studentId: { in: studentIds }, status: 'GRADED' },
        select: {
          studentId: true,
          assessmentId: true,
          percent: true,
          topicPerformance: { select: { topic: true, percent: true } },
        },
      }),
      this.prisma.enrollment.findMany({
        where: { userId: { in: studentIds }, status: 'ACTIVE' },
        select: { userId: true, progress: { select: { percent: true } } },
      }),
    ]);

    const attendanceByStudent = new Map<string, Array<{ status: (typeof attendance)[number]['status'] }>>();
    for (const r of attendance) {
      const list = attendanceByStudent.get(r.studentId) ?? [];
      list.push({ status: r.status });
      attendanceByStudent.set(r.studentId, list);
    }
    for (const [id, records] of attendanceByStudent) {
      const summary = computeAttendanceRate(records);
      const s = result.get(id)!;
      s.attendanceRate = summary.rate;
      s.attendanceCount = summary.total;
      s.presentCount = summary.present;
      s.lateCount = summary.late;
      s.absentCount = summary.absent;
    }

    const publishedByBatch = new Map<string, Array<{ id: string }>>();
    const batchIds = [...new Set(batchLinks.map((l) => l.batchId))];
    if (batchIds.length) {
      const published = await this.prisma.assignment.findMany({
        where: { batchId: { in: batchIds }, status: 'PUBLISHED' },
        select: { id: true, batchId: true },
      });
      for (const a of published) {
        const list = publishedByBatch.get(a.batchId) ?? [];
        list.push({ id: a.id });
        publishedByBatch.set(a.batchId, list);
      }
    }
    const submittedByStudent = new Map<string, Set<string>>();
    const scoresByStudent = new Map<string, number[]>();
    for (const sub of submissions) {
      const set = submittedByStudent.get(sub.studentId) ?? new Set<string>();
      set.add(sub.assignmentId);
      submittedByStudent.set(sub.studentId, set);

      const score =
        sub.evaluation?.finalScore ?? sub.evaluation?.trainerScore ?? sub.evaluation?.aiScore;
      if (score != null && sub.assignment.maxScore > 0) {
        const list = scoresByStudent.get(sub.studentId) ?? [];
        list.push((score / sub.assignment.maxScore) * 100);
        scoresByStudent.set(sub.studentId, list);
      }
    }
    for (const id of studentIds) {
      const s = result.get(id)!;
      const scores = scoresByStudent.get(id) ?? [];
      s.assignmentCount = scores.length;
      s.assignmentAvg = scores.length
        ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
        : 0;

      const myBatches = batchLinks.filter((l) => l.userId === id).map((l) => l.batchId);
      const submitted = submittedByStudent.get(id) ?? new Set<string>();
      let missing = 0;
      let publishedTotal = 0;
      for (const batchId of myBatches) {
        for (const a of publishedByBatch.get(batchId) ?? []) {
          publishedTotal += 1;
          if (!submitted.has(a.id)) missing += 1;
        }
      }
      s.missingAssignments = missing;
      const submittedCount = submitted.size;
      const denom = submittedCount + missing;
      s.submissionRate = denom > 0 ? Math.round((submittedCount / denom) * 100) : publishedTotal === 0 ? 0 : 100;
    }

    const bestByStudent = new Map<string, Map<string, number>>();
    const topicAgg = new Map<string, Map<string, { sum: number; count: number }>>();
    for (const at of attempts) {
      if (at.percent == null) continue;
      const best = bestByStudent.get(at.studentId) ?? new Map<string, number>();
      best.set(at.assessmentId, Math.max(best.get(at.assessmentId) ?? 0, at.percent));
      bestByStudent.set(at.studentId, best);

      const topics = topicAgg.get(at.studentId) ?? new Map<string, { sum: number; count: number }>();
      for (const t of at.topicPerformance) {
        const agg = topics.get(t.topic) ?? { sum: 0, count: 0 };
        agg.sum += t.percent;
        agg.count += 1;
        topics.set(t.topic, agg);
      }
      topicAgg.set(at.studentId, topics);
    }
    for (const [id, best] of bestByStudent) {
      const s = result.get(id)!;
      const values = [...best.values()];
      s.assessmentCount = values.length;
      s.assessmentAvg = values.length
        ? Math.round(values.reduce((a, b) => a + b, 0) / values.length)
        : 0;
    }
    for (const [id, topics] of topicAgg) {
      const s = result.get(id)!;
      s.topics = [...topics.entries()]
        .map(([topic, agg]) => ({ topic, percent: Math.round(agg.sum / agg.count) }))
        .sort((a, b) => a.percent - b.percent);
    }

    const progressByStudent = new Map<string, number[]>();
    for (const e of enrollments) {
      const list = progressByStudent.get(e.userId) ?? [];
      list.push(e.progress?.percent ?? 0);
      progressByStudent.set(e.userId, list);
    }
    for (const [id, list] of progressByStudent) {
      const s = result.get(id)!;
      s.courseProgress = list.length
        ? Math.round(list.reduce((a, b) => a + b, 0) / list.length)
        : 0;
    }

    return result;
  }
}
