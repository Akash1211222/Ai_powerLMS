import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import {
  ensureInterventionForRisk,
  evaluateStudentRisk,
  recomputeStudentSkills,
  computeAndStoreStudentScore,
  type RiskEvaluation,
} from '@fca/analytics';
import { runRecoveryPlanGeneration, getProvider } from '@fca/ai';
import { PrismaService } from '../prisma/prisma.service';
import { UserContextService } from '../authz/user-context.service';
import { NotificationService } from '../notifications/notification.service';
import { AuditService } from '../audit/audit.service';
import { QueueService } from '../queue/queue.service';
import { assertStudentAccess } from '../common/tenant';

const ACTIVE_STATUSES = ['OPEN', 'PLAN_READY', 'IN_PROGRESS'] as const;

/**
 * The automated intervention workflow (§19): risk escalation → intervention →
 * AI recovery plan → notifications → task completion → recalculation →
 * resolution. Creation is idempotent (§37); AI output is schema-validated and
 * the deterministic numbers it responds to are computed by the platform (§17).
 */
@Injectable()
export class InterventionsService {
  private readonly logger = new Logger(InterventionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly userContext: UserContextService,
    private readonly notifications: NotificationService,
    private readonly audit: AuditService,
    private readonly queue: QueueService,
  ) {}

  /**
   * Called by the risk engine on a meaningful HIGH/CRITICAL escalation.
   * Never throws — intervention failures must not break the triggering action.
   */
  async handleEscalation(evaluation: RiskEvaluation): Promise<void> {
    try {
      const result = await ensureInterventionForRisk(this.prisma, evaluation);
      if (!result.created || !result.interventionId) return;

      await this.audit.record({
        action: 'intervention.created',
        targetType: 'StudentIntervention',
        targetId: result.interventionId,
        metadata: { level: evaluation.level, score: evaluation.score },
      });
      await this.notifications.notify(evaluation.userId, {
        type: 'RISK_INTERVENTION',
        title: 'We’re here to help',
        body: 'We noticed you might be falling behind, so we’re preparing a personalized recovery plan.',
        deepLink: '/dashboard',
      });

      // Heuristic provider is instant + free → generate inline so the workflow
      // completes even without a worker (dev/CI). A real AI provider is slower,
      // so it runs in the background (§46: no slow AI inside requests).
      const provider = getProvider();
      if (provider.name === 'heuristic') {
        const plan = await runRecoveryPlanGeneration(this.prisma, result.interventionId, provider);
        if (!plan.skipped) await this.notifyPlanReady(evaluation.userId);
      } else {
        await this.queue.enqueueRecoveryPlan(result.interventionId);
      }
    } catch (err) {
      this.logger.error(`Intervention handling failed: ${(err as Error).message}`);
    }
  }

  private async notifyPlanReady(userId: string): Promise<void> {
    await this.notifications.notify(userId, {
      type: 'RECOVERY_TASK',
      title: 'Your recovery plan is ready',
      body: 'A personalized plan with concrete next steps is waiting on your dashboard.',
      deepLink: '/dashboard',
    });
  }

  // --- Student self-service ---------------------------------------------

  async getMine(userId: string) {
    const [active, history] = await Promise.all([
      this.prisma.studentIntervention.findFirst({
        where: { userId, status: { in: [...ACTIVE_STATUSES] } },
        orderBy: { createdAt: 'desc' },
        include: { plan: { include: { tasks: { orderBy: { order: 'asc' } } } } },
      }),
      this.prisma.studentIntervention.findMany({
        where: { userId, status: { in: ['RESOLVED', 'CANCELLED'] } },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { id: true, status: true, riskLevel: true, reason: true, resolvedAt: true, createdAt: true },
      }),
    ]);
    return { active, history };
  }

  /** Marks one of the student's own recovery tasks complete (idempotent). */
  async completeTask(userId: string, taskId: string) {
    const task = await this.prisma.recoveryPlanTask.findUnique({
      where: { id: taskId },
      include: { plan: { include: { intervention: true } } },
    });
    if (!task) throw new NotFoundException('Task not found');
    const intervention = task.plan.intervention;
    if (intervention.userId !== userId) {
      throw new ForbiddenException('You can only complete your own recovery tasks');
    }
    if (intervention.status === 'RESOLVED' || intervention.status === 'CANCELLED') {
      throw new BadRequestException('This intervention is already closed');
    }

    if (!task.completedAt) {
      await this.prisma.recoveryPlanTask.update({
        where: { id: taskId },
        data: { completedAt: new Date() },
      });
    }
    if (intervention.status === 'PLAN_READY') {
      await this.prisma.studentIntervention.update({
        where: { id: intervention.id },
        data: { status: 'IN_PROGRESS' },
      });
    }

    const remaining = await this.prisma.recoveryPlanTask.count({
      where: { planId: task.planId, completedAt: null },
    });

    let interventionStatus = 'IN_PROGRESS';
    let riskLevel: string | null = null;

    if (remaining === 0) {
      // All recovery activities done → recalculate the full picture (§19).
      await recomputeStudentSkills(this.prisma, userId);
      await computeAndStoreStudentScore(this.prisma, userId);
      const risk = await evaluateStudentRisk(this.prisma, userId);
      riskLevel = risk.level;

      if (risk.level === 'LOW' || risk.level === 'MEDIUM') {
        await this.prisma.studentIntervention.update({
          where: { id: intervention.id },
          data: { status: 'RESOLVED', resolvedAt: new Date() },
        });
        interventionStatus = 'RESOLVED';
        await this.audit.record({
          action: 'intervention.resolved',
          actorUserId: userId,
          targetType: 'StudentIntervention',
          targetId: intervention.id,
          metadata: { via: 'tasks_completed', riskLevel: risk.level },
        });
      }
    }

    return { taskId, allTasksCompleted: remaining === 0, interventionStatus, riskLevel };
  }

  // --- Staff ------------------------------------------------------------

  async getStudentInterventions(actorId: string, studentId: string) {
    await assertStudentAccess(this.userContext, this.prisma, actorId, studentId);
    return this.prisma.studentIntervention.findMany({
      where: { userId: studentId },
      orderBy: { createdAt: 'desc' },
      include: { plan: { include: { tasks: { orderBy: { order: 'asc' } } } } },
    });
  }

  /** Manual plan generation (inline; idempotent — skips if a plan exists). */
  async generatePlan(actorId: string, interventionId: string) {
    const intervention = await this.loadForStaff(actorId, interventionId);
    const result = await runRecoveryPlanGeneration(this.prisma, interventionId);
    if (!result.skipped) await this.notifyPlanReady(intervention.userId);
    return result;
  }

  async resolve(actorId: string, interventionId: string) {
    const intervention = await this.loadForStaff(actorId, interventionId);
    if (intervention.status === 'RESOLVED') return intervention;
    const updated = await this.prisma.studentIntervention.update({
      where: { id: interventionId },
      data: { status: 'RESOLVED', resolvedAt: new Date() },
    });
    await this.audit.record({
      action: 'intervention.resolved',
      actorUserId: actorId,
      targetType: 'StudentIntervention',
      targetId: interventionId,
      metadata: { via: 'staff' },
    });
    return updated;
  }

  private async loadForStaff(actorId: string, interventionId: string) {
    const intervention = await this.prisma.studentIntervention.findUnique({
      where: { id: interventionId },
    });
    if (!intervention) throw new NotFoundException('Intervention not found');
    await assertStudentAccess(this.userContext, this.prisma, actorId, intervention.userId);
    return intervention;
  }
}
