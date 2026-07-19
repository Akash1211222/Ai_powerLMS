import { Injectable, ForbiddenException, NotFoundException, Logger } from '@nestjs/common';
import { evaluateStudentRisk, type RiskEvaluation } from '@fca/analytics';
import { PrismaService } from '../prisma/prisma.service';
import { UserContextService } from '../authz/user-context.service';
import { NotificationService } from '../notifications/notification.service';
import { AuditService } from '../audit/audit.service';
import { InterventionsService } from '../interventions/interventions.service';
import { isMemberOf } from '../authz/principal';
import { assertOrgAccess } from '../common/tenant';

/**
 * At-risk detection (§18). Deterministic rules live in @fca/analytics; this
 * service handles authorization, alerting and batch views. Alerts fire only when
 * risk meaningfully escalates — no spam.
 */
@Injectable()
export class RiskService {
  private readonly logger = new Logger(RiskService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly userContext: UserContextService,
    private readonly notifications: NotificationService,
    private readonly audit: AuditService,
    private readonly interventions: InterventionsService,
  ) {}

  private async assertCanViewStudent(actorId: string, studentId: string) {
    const principal = await this.userContext.getPrincipal(actorId);
    if (principal.isSuperAdmin) return;
    const memberships = await this.prisma.organizationMember.findMany({
      where: { userId: studentId },
      select: { organizationId: true },
    });
    if (!memberships.some((m) => isMemberOf(principal, m.organizationId))) {
      throw new ForbiddenException('You do not have access to this student');
    }
  }

  /** Latest snapshot + recent history for a student (staff drill-down). */
  async getStudentRisk(actorId: string, studentId: string) {
    await this.assertCanViewStudent(actorId, studentId);
    const [latest, history] = await Promise.all([
      this.prisma.studentRiskSnapshot.findFirst({
        where: { userId: studentId },
        orderBy: { detectedAt: 'desc' },
      }),
      this.prisma.studentRiskSnapshot.findMany({
        where: { userId: studentId },
        orderBy: { detectedAt: 'desc' },
        take: 10,
        select: { level: true, score: true, detectedAt: true },
      }),
    ]);
    return { latest, history };
  }

  async evaluate(actorId: string, studentId: string) {
    await this.assertCanViewStudent(actorId, studentId);
    const result = await evaluateStudentRisk(this.prisma, studentId);
    await this.alertIfEscalated(result);
    return result;
  }

  /** Best-effort evaluation for event/scheduled triggers. */
  async evaluateSafe(studentId: string): Promise<void> {
    try {
      const result = await evaluateStudentRisk(this.prisma, studentId);
      await this.alertIfEscalated(result);
    } catch (err) {
      this.logger.warn(`Risk evaluation failed for ${studentId}: ${(err as Error).message}`);
    }
  }

  /** Alerts the batch's trainers when a student escalates to HIGH/CRITICAL. */
  private async alertIfEscalated(result: RiskEvaluation): Promise<void> {
    if (!result.changed) return;
    if (result.level !== 'HIGH' && result.level !== 'CRITICAL') return;

    await this.audit.record({
      action: 'risk.escalated',
      targetType: 'User',
      targetId: result.userId,
      metadata: { level: result.level, score: result.score, from: result.previousLevel },
    });

    // §19: escalation kicks off the automated intervention + recovery plan.
    await this.interventions.handleEscalation(result);

    if (!result.batchId) return;
    const [trainers, student] = await Promise.all([
      this.prisma.batchTrainer.findMany({ where: { batchId: result.batchId }, select: { userId: true } }),
      this.prisma.user.findUnique({ where: { id: result.userId }, include: { profile: true } }),
    ]);
    const name = student?.profile
      ? `${student.profile.firstName} ${student.profile.lastName}`
      : (student?.email ?? 'A student');
    const topFactors = result.factors.slice(0, 2).map((f) => f.label).join(', ');

    await this.notifications.notifyMany(
      trainers.map((t) => t.userId),
      {
        type: 'RISK_INTERVENTION',
        title: `${name} is at ${result.level.toLowerCase()} risk`,
        body: `Risk score ${result.score}/100. Top factors: ${topFactors || 'multiple signals'}.`,
        deepLink: `/batches/${result.batchId}`,
      },
    );
  }

  /** At-risk students in a batch, worst first — the trainer's work queue (§9). */
  async getBatchAtRisk(actorId: string, batchId: string) {
    const batch = await this.prisma.batch.findUnique({ where: { id: batchId } });
    if (!batch) throw new NotFoundException('Batch not found');
    await assertOrgAccess(this.userContext, actorId, batch.organizationId);

    const students = await this.prisma.batchStudent.findMany({
      where: { batchId, status: 'ACTIVE' },
      select: { userId: true },
    });
    const userIds = students.map((s) => s.userId);
    if (userIds.length === 0) return [];

    const snapshots = await this.prisma.studentRiskSnapshot.findMany({
      where: { userId: { in: userIds } },
      orderBy: { detectedAt: 'desc' },
      include: { user: { include: { profile: true } } },
    });

    // Keep only the most recent snapshot per student.
    const latest = new Map<string, (typeof snapshots)[number]>();
    for (const s of snapshots) if (!latest.has(s.userId)) latest.set(s.userId, s);

    return [...latest.values()]
      .filter((s) => s.level !== 'LOW')
      .sort((a, b) => b.score - a.score)
      .map((s) => ({
        userId: s.userId,
        name: s.user.profile
          ? `${s.user.profile.firstName} ${s.user.profile.lastName}`
          : s.user.email,
        level: s.level,
        score: s.score,
        factors: s.factors,
        recommendedActions: s.recommendedActions,
        detectedAt: s.detectedAt,
      }));
  }

  /** At-risk students across every batch the caller trains (dashboard queue). */
  async getTrainerAtRisk(trainerId: string) {
    const batches = await this.prisma.batchTrainer.findMany({
      where: { userId: trainerId },
      select: { batchId: true, batch: { select: { name: true } } },
    });
    const batchNameById = new Map(batches.map((b) => [b.batchId, b.batch.name]));
    const batchIds = batches.map((b) => b.batchId);
    if (batchIds.length === 0) return [];

    const students = await this.prisma.batchStudent.findMany({
      where: { batchId: { in: batchIds }, status: 'ACTIVE' },
      select: { userId: true, batchId: true },
    });
    const batchByUser = new Map(students.map((s) => [s.userId, s.batchId]));
    if (students.length === 0) return [];

    const snapshots = await this.prisma.studentRiskSnapshot.findMany({
      where: { userId: { in: students.map((s) => s.userId) } },
      orderBy: { detectedAt: 'desc' },
      include: { user: { include: { profile: true } } },
    });
    const latest = new Map<string, (typeof snapshots)[number]>();
    for (const s of snapshots) if (!latest.has(s.userId)) latest.set(s.userId, s);

    return [...latest.values()]
      .filter((s) => s.level !== 'LOW')
      .sort((a, b) => b.score - a.score)
      .map((s) => ({
        userId: s.userId,
        name: s.user.profile ? `${s.user.profile.firstName} ${s.user.profile.lastName}` : s.user.email,
        batchName: batchNameById.get(batchByUser.get(s.userId) ?? '') ?? null,
        level: s.level,
        score: s.score,
        factors: s.factors,
        recommendedActions: s.recommendedActions,
        detectedAt: s.detectedAt,
      }));
  }

  /** Sweep every active student (ops trigger; the worker runs this on a schedule). */
  async evaluateAll(actorId: string) {
    const principal = await this.userContext.getPrincipal(actorId);
    if (!principal.isSuperAdmin) throw new ForbiddenException('Super admin only');
    const students = await this.prisma.batchStudent.findMany({
      where: { status: 'ACTIVE' },
      select: { userId: true },
      distinct: ['userId'],
    });
    let flagged = 0;
    for (const s of students) {
      const result = await evaluateStudentRisk(this.prisma, s.userId);
      await this.alertIfEscalated(result);
      if (result.level !== 'LOW') flagged++;
    }
    return { evaluated: students.length, flagged };
  }
}
