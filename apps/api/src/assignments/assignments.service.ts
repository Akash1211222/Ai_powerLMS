import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { runSubmissionEvaluation, getProvider } from '@fca/ai';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { UserContextService } from '../authz/user-context.service';
import { QueueService } from '../queue/queue.service';
import { assertOrgAccess } from '../common/tenant';
import type {
  CreateAssignmentDto,
  SubmitDto,
  ReviewEvaluationDto,
} from './dto/assignment.schemas';

@Injectable()
export class AssignmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly userContext: UserContextService,
    private readonly queue: QueueService,
  ) {}

  private async loadOwnedBatch(userId: string, batchId: string) {
    const batch = await this.prisma.batch.findUnique({ where: { id: batchId } });
    if (!batch) throw new NotFoundException('Batch not found');
    await assertOrgAccess(this.userContext, userId, batch.organizationId);
    return batch;
  }

  private async loadStaffAssignment(userId: string, assignmentId: string) {
    const assignment = await this.prisma.assignment.findUnique({
      where: { id: assignmentId },
      include: { batch: true, criteria: true },
    });
    if (!assignment) throw new NotFoundException('Assignment not found');
    await assertOrgAccess(this.userContext, userId, assignment.batch.organizationId);
    return assignment;
  }

  private async assertEnrolled(userId: string, batchId: string) {
    const link = await this.prisma.batchStudent.findUnique({
      where: { batchId_userId: { batchId, userId } },
    });
    if (!link || link.status !== 'ACTIVE') {
      throw new ForbiddenException('You are not enrolled in this batch');
    }
  }

  // --- Authoring --------------------------------------------------------

  async create(userId: string, dto: CreateAssignmentDto) {
    const batch = await this.loadOwnedBatch(userId, dto.batchId);
    const assignment = await this.prisma.assignment.create({
      data: {
        batchId: dto.batchId,
        courseId: dto.courseId ?? batch.courseId,
        moduleId: dto.moduleId ?? null,
        title: dto.title,
        description: dto.description ?? null,
        instructions: dto.instructions ?? null,
        difficulty: dto.difficulty ?? 'MEDIUM',
        maxScore: dto.maxScore ?? 100,
        dueAt: dto.dueAt ?? null,
        allowLate: dto.allowLate ?? false,
        maxAttempts: dto.maxAttempts ?? 1,
        aiEvaluationEnabled: dto.aiEvaluationEnabled ?? true,
        createdById: userId,
        criteria: {
          create: dto.criteria.map((c, i) => ({
            title: c.title,
            description: c.description ?? null,
            weight: c.weight,
            order: i,
          })),
        },
      },
      include: { criteria: true },
    });
    await this.audit.record({
      action: 'assignment.create',
      actorUserId: userId,
      organizationId: batch.organizationId,
      targetType: 'Assignment',
      targetId: assignment.id,
    });
    return assignment;
  }

  async publish(userId: string, assignmentId: string) {
    await this.loadStaffAssignment(userId, assignmentId);
    return this.prisma.assignment.update({
      where: { id: assignmentId },
      data: { status: 'PUBLISHED' },
    });
  }

  async listForBatch(userId: string, batchId: string) {
    await this.loadOwnedBatch(userId, batchId);
    return this.prisma.assignment.findMany({
      where: { batchId },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { submissions: true, criteria: true } } },
    });
  }

  async listSubmissions(userId: string, assignmentId: string) {
    await this.loadStaffAssignment(userId, assignmentId);
    return this.prisma.assignmentSubmission.findMany({
      where: { assignmentId },
      orderBy: { submittedAt: 'desc' },
      include: {
        student: { include: { profile: true } },
        evaluation: { include: { criterionScores: true } },
      },
    });
  }

  // --- Student ----------------------------------------------------------

  async submit(userId: string, assignmentId: string, dto: SubmitDto) {
    const assignment = await this.prisma.assignment.findUnique({ where: { id: assignmentId } });
    if (!assignment) throw new NotFoundException('Assignment not found');
    if (assignment.status !== 'PUBLISHED') {
      throw new BadRequestException('This assignment is not open for submissions');
    }
    await this.assertEnrolled(userId, assignment.batchId);

    if (assignment.dueAt && assignment.dueAt < new Date() && !assignment.allowLate) {
      throw new BadRequestException('The deadline has passed and late submission is not allowed');
    }

    const priorCount = await this.prisma.assignmentSubmission.count({
      where: { assignmentId, studentId: userId },
    });
    if (priorCount >= assignment.maxAttempts) {
      throw new BadRequestException('You have used all allowed attempts');
    }

    const submission = await this.prisma.assignmentSubmission.create({
      data: {
        assignmentId,
        studentId: userId,
        attemptNumber: priorCount + 1,
        contentText: dto.contentText ?? null,
        repoUrl: dto.repoUrl ?? null,
        status: 'SUBMITTED',
        submittedAt: new Date(),
      },
    });

    if (assignment.aiEvaluationEnabled) {
      await this.prisma.assignmentEvaluation.create({
        data: { submissionId: submission.id, status: 'PENDING' },
      });
      await this.queue.enqueueEvaluation(submission.id); // async; worker evaluates
    }
    return submission;
  }

  async listMine(userId: string) {
    const links = await this.prisma.batchStudent.findMany({
      where: { userId, status: 'ACTIVE' },
      select: { batchId: true },
    });
    const batchIds = links.map((l) => l.batchId);
    if (batchIds.length === 0) return [];
    return this.prisma.assignment.findMany({
      where: { batchId: { in: batchIds }, status: 'PUBLISHED' },
      orderBy: [{ dueAt: 'asc' }, { createdAt: 'desc' }],
      include: {
        submissions: {
          where: { studentId: userId },
          orderBy: { attemptNumber: 'desc' },
          take: 1,
          select: { id: true, status: true, attemptNumber: true, submittedAt: true },
        },
      },
    });
  }

  async getMine(userId: string, assignmentId: string) {
    const assignment = await this.prisma.assignment.findUnique({
      where: { id: assignmentId },
      include: { criteria: { orderBy: { order: 'asc' } } },
    });
    if (!assignment) throw new NotFoundException('Assignment not found');
    await this.assertEnrolled(userId, assignment.batchId);

    const submission = await this.prisma.assignmentSubmission.findFirst({
      where: { assignmentId, studentId: userId },
      orderBy: { attemptNumber: 'desc' },
      include: { evaluation: { include: { criterionScores: true } } },
    });

    // Students only see feedback once it's RELEASED (§15).
    let evaluation = submission?.evaluation ?? null;
    if (evaluation && evaluation.status !== 'RELEASED') {
      evaluation = null;
    }
    return { assignment, submission: submission ? { ...submission, evaluation } : null };
  }

  // --- Evaluation (staff) ----------------------------------------------

  private async loadOwnedSubmission(userId: string, submissionId: string) {
    const submission = await this.prisma.assignmentSubmission.findUnique({
      where: { id: submissionId },
      include: { assignment: { include: { batch: true } } },
    });
    if (!submission) throw new NotFoundException('Submission not found');
    await assertOrgAccess(this.userContext, userId, submission.assignment.batch.organizationId);
    return submission;
  }

  /** Manual/trigger evaluation. Runs the shared orchestrator (heuristic in dev). */
  async evaluate(userId: string, submissionId: string) {
    await this.loadOwnedSubmission(userId, submissionId);
    const result = await runSubmissionEvaluation(this.prisma, submissionId, getProvider());
    await this.audit.record({
      action: 'assignment.evaluate',
      actorUserId: userId,
      targetType: 'AssignmentSubmission',
      targetId: submissionId,
      metadata: { ...result },
    });
    return result;
  }

  /** Trainer override — the human decision; AI will never overwrite it (§15). */
  async review(userId: string, submissionId: string, dto: ReviewEvaluationDto) {
    const submission = await this.loadOwnedSubmission(userId, submissionId);
    const maxScore = submission.assignment.maxScore;
    const trainerScore = Math.max(0, Math.min(maxScore, dto.trainerScore));

    const evaluation = await this.prisma.assignmentEvaluation.upsert({
      where: { submissionId },
      update: {
        trainerScore,
        finalScore: trainerScore,
        reason: dto.reason ?? undefined,
        reviewedById: userId,
        reviewedAt: new Date(),
        status: dto.release ? 'RELEASED' : 'NEEDS_REVIEW',
      },
      create: {
        submissionId,
        trainerScore,
        finalScore: trainerScore,
        reason: dto.reason ?? null,
        reviewedById: userId,
        reviewedAt: new Date(),
        status: dto.release ? 'RELEASED' : 'NEEDS_REVIEW',
      },
    });
    if (dto.release) {
      await this.prisma.assignmentSubmission.update({
        where: { id: submissionId },
        data: { status: 'RETURNED' },
      });
    }
    await this.audit.record({
      action: 'assignment.review',
      actorUserId: userId,
      organizationId: submission.assignment.batch.organizationId,
      targetType: 'AssignmentSubmission',
      targetId: submissionId,
      metadata: { trainerScore, released: dto.release },
    });
    return evaluation;
  }
}
