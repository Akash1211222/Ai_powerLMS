import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { generateAssignment, runSubmissionEvaluation, getProvider } from '@fca/ai';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { UserContextService } from '../authz/user-context.service';
import { QueueService } from '../queue/queue.service';
import { NotificationService } from '../notifications/notification.service';
import { ScoresService } from '../skills/scores.service';
import { assertOrgAccess } from '../common/tenant';
import type {
  CreateAssignmentDto,
  SubmitDto,
  ReviewEvaluationDto,
  AiGenerateAssignmentDto,
} from './dto/assignment.schemas';

@Injectable()
export class AssignmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly userContext: UserContextService,
    private readonly queue: QueueService,
    private readonly notifications: NotificationService,
    private readonly scores: ScoresService,
  ) {}

  private async batchStudentIds(batchId: string): Promise<string[]> {
    const rows = await this.prisma.batchStudent.findMany({
      where: { batchId, status: 'ACTIVE' },
      select: { userId: true },
    });
    return rows.map((r) => r.userId);
  }

  private async loadOwnedBatch(userId: string, batchId: string) {
    const batch = await this.prisma.batch.findUnique({
      where: { id: batchId },
      include: { course: { select: { id: true, title: true, level: true } } },
    });
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
    const publish = dto.publish === true;
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
        maxAttempts: dto.maxAttempts ?? 3,
        aiEvaluationEnabled: dto.aiEvaluationEnabled ?? true,
        language: dto.language ?? 'NONE',
        starterCode: dto.starterCode ?? null,
        aiGenerated: dto.aiGenerated ?? false,
        status: publish ? 'PUBLISHED' : 'DRAFT',
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
      metadata: { language: assignment.language, aiGenerated: assignment.aiGenerated },
    });
    if (publish) {
      const studentIds = await this.batchStudentIds(assignment.batchId);
      await this.notifications.notifyMany(studentIds, {
        type: 'ASSIGNMENT_PUBLISHED',
        title: 'New assignment',
        body: `"${assignment.title}" has been assigned to your batch.`,
        deepLink: `/assignments/${assignment.id}`,
      });
    }
    return assignment;
  }

  /**
   * AI generates a course-matched coding (or written) assignment for the whole
   * batch — language is inferred from the course (Python → Python compiler, etc.).
   */
  async aiGenerate(userId: string, dto: AiGenerateAssignmentDto) {
    const batch = await this.loadOwnedBatch(userId, dto.batchId);
    const generated = await generateAssignment({
      courseTitle: batch.course.title,
      courseLevel: batch.course.level,
      batchName: batch.name,
      topicHint: dto.topicHint,
      difficulty: dto.difficulty,
    });
    return this.create(userId, {
      batchId: dto.batchId,
      courseId: batch.courseId,
      title: generated.title,
      description: generated.description,
      instructions: generated.instructions,
      difficulty: generated.difficulty,
      maxScore: generated.maxScore,
      language: generated.language,
      starterCode: generated.starterCode,
      aiGenerated: true,
      aiEvaluationEnabled: true,
      publish: dto.publish ?? true,
      criteria: generated.criteria,
    });
  }

  /**
   * Called when a student is enrolled. If the batch has no published work yet,
   * auto-create an AI assignment matched to the course language so the student
   * immediately gets something to do in the right compiler.
   */
  async ensureCourseAssignments(actorUserId: string, batchId: string) {
    const published = await this.prisma.assignment.count({
      where: { batchId, status: 'PUBLISHED' },
    });
    if (published > 0) return { created: false, reason: 'already_has_assignments' as const };
    const created = await this.aiGenerate(actorUserId, { batchId, publish: true });
    return { created: true, assignmentId: created.id };
  }

  async publish(userId: string, assignmentId: string) {
    const assignment = await this.loadStaffAssignment(userId, assignmentId);
    const updated = await this.prisma.assignment.update({
      where: { id: assignmentId },
      data: { status: 'PUBLISHED' },
    });
    const studentIds = await this.batchStudentIds(assignment.batchId);
    await this.notifications.notifyMany(studentIds, {
      type: 'ASSIGNMENT_PUBLISHED',
      title: 'New assignment',
      body: `"${assignment.title}" has been assigned to your batch.`,
      deepLink: `/assignments/${assignmentId}`,
    });
    return updated;
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
        codeOutput: dto.codeOutput ?? null,
        repoUrl: dto.repoUrl ?? null,
        status: 'SUBMITTED',
        submittedAt: new Date(),
      },
    });

    let evaluation = null;
    if (assignment.aiEvaluationEnabled) {
      await this.prisma.assignmentEvaluation.create({
        data: { submissionId: submission.id, status: 'PENDING' },
      });
      // Instant sync scoring so the student sees the grade immediately.
      // Queue remains as a resilient fallback if sync fails.
      try {
        await runSubmissionEvaluation(this.prisma, submission.id, getProvider());
      } catch {
        await this.queue.enqueueEvaluation(submission.id);
      }
      evaluation = await this.prisma.assignmentEvaluation.findUnique({
        where: { submissionId: submission.id },
        include: { criterionScores: true },
      });
    }

    const refreshed = await this.prisma.assignmentSubmission.findUnique({
      where: { id: submission.id },
    });
    return { ...refreshed, evaluation };
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
          select: {
            id: true,
            status: true,
            attemptNumber: true,
            submittedAt: true,
            evaluation: {
              select: {
                status: true,
                finalScore: true,
                aiScore: true,
                trainerScore: true,
              },
            },
          },
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

    // Students see feedback once RELEASED (auto-released by high-confidence AI)
    // or AI_COMPLETED (legacy). Hide NEEDS_REVIEW / PENDING drafts.
    let evaluation = submission?.evaluation ?? null;
    if (
      evaluation &&
      evaluation.status !== 'RELEASED' &&
      evaluation.status !== 'AI_COMPLETED'
    ) {
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
    if (dto.release) {
      await this.notifications.notify(submission.studentId, {
        type: 'ASSIGNMENT_EVALUATED',
        title: 'Assignment evaluated',
        body: `Your submission for "${submission.assignment.title}" was graded: ${trainerScore}/${maxScore}.`,
        deepLink: `/assignments/${submission.assignmentId}`,
      });
      // Released grade changes performance → refresh composite scores (§17).
      await this.scores.recomputeSafe(submission.studentId);
    }
    return evaluation;
  }
}
