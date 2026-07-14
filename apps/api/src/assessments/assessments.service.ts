import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { UserContextService } from '../authz/user-context.service';
import { NotificationService } from '../notifications/notification.service';
import { SkillsService } from '../skills/skills.service';
import { ScoresService } from '../skills/scores.service';
import { assertOrgAccess } from '../common/tenant';
import { gradeAttempt, type GradableQuestion } from './grading';
import type { CreateAssessmentDto, SubmitAttemptDto } from './dto/assessment.schemas';

const OBJECTIVE = new Set(['MCQ', 'MULTI_SELECT', 'TRUE_FALSE']);

@Injectable()
export class AssessmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly userContext: UserContextService,
    private readonly notifications: NotificationService,
    private readonly skills: SkillsService,
    private readonly scores: ScoresService,
  ) {}

  private async loadOwnedBatch(userId: string, batchId: string) {
    const batch = await this.prisma.batch.findUnique({ where: { id: batchId } });
    if (!batch) throw new NotFoundException('Batch not found');
    await assertOrgAccess(this.userContext, userId, batch.organizationId);
    return batch;
  }

  private async loadOwnedAssessment(userId: string, id: string) {
    const a = await this.prisma.assessment.findUnique({ where: { id }, include: { batch: true } });
    if (!a) throw new NotFoundException('Assessment not found');
    await assertOrgAccess(this.userContext, userId, a.batch.organizationId);
    return a;
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

  async create(userId: string, dto: CreateAssessmentDto) {
    const batch = await this.loadOwnedBatch(userId, dto.batchId);

    // Validate objective questions have options with at least one correct.
    for (const q of dto.questions) {
      if (OBJECTIVE.has(q.type)) {
        const opts = q.options ?? [];
        if (opts.length < 2) throw new BadRequestException(`"${q.prompt}" needs at least 2 options`);
        if (!opts.some((o) => o.isCorrect)) {
          throw new BadRequestException(`"${q.prompt}" needs at least one correct option`);
        }
      }
    }

    const assessment = await this.prisma.assessment.create({
      data: {
        batchId: dto.batchId,
        courseId: dto.courseId ?? batch.courseId,
        title: dto.title,
        description: dto.description ?? null,
        timeLimitMin: dto.timeLimitMin ?? null,
        maxAttempts: dto.maxAttempts ?? 1,
        shuffleQuestions: dto.shuffleQuestions ?? false,
        passingScore: dto.passingScore ?? null,
        dueAt: dto.dueAt ?? null,
        createdById: userId,
        questions: {
          create: dto.questions.map((q, i) => ({
            type: q.type,
            prompt: q.prompt,
            topic: q.topic ?? null,
            skillTag: q.skillTag ?? null,
            difficulty: q.difficulty ?? 'MEDIUM',
            points: q.points ?? 1,
            order: i,
            correctText: q.correctText ?? null,
            explanation: q.explanation ?? null,
            options: {
              create: (q.options ?? []).map((o, j) => ({
                text: o.text,
                isCorrect: o.isCorrect ?? false,
                order: j,
              })),
            },
          })),
        },
      },
      include: { questions: { include: { options: true } } },
    });
    await this.audit.record({
      action: 'assessment.create',
      actorUserId: userId,
      organizationId: batch.organizationId,
      targetType: 'Assessment',
      targetId: assessment.id,
    });
    return assessment;
  }

  async publish(userId: string, id: string) {
    const assessment = await this.loadOwnedAssessment(userId, id);
    const updated = await this.prisma.assessment.update({ where: { id }, data: { status: 'PUBLISHED' } });
    const students = await this.prisma.batchStudent.findMany({
      where: { batchId: assessment.batchId, status: 'ACTIVE' },
      select: { userId: true },
    });
    await this.notifications.notifyMany(
      students.map((s) => s.userId),
      {
        type: 'ASSESSMENT_PUBLISHED',
        title: 'New test available',
        body: `"${assessment.title}" is now open in your batch.`,
        deepLink: '/dashboard',
      },
    );
    return updated;
  }

  async listForBatch(userId: string, batchId: string) {
    await this.loadOwnedBatch(userId, batchId);
    return this.prisma.assessment.findMany({
      where: { batchId },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { questions: true, attempts: true } } },
    });
  }

  async getForStaff(userId: string, id: string) {
    await this.loadOwnedAssessment(userId, id);
    return this.prisma.assessment.findUnique({
      where: { id },
      include: { questions: { orderBy: { order: 'asc' }, include: { options: true } } },
    });
  }

  async listAttempts(userId: string, id: string) {
    await this.loadOwnedAssessment(userId, id);
    return this.prisma.assessmentAttempt.findMany({
      where: { assessmentId: id, status: 'GRADED' },
      orderBy: { submittedAt: 'desc' },
      include: {
        student: { include: { profile: true } },
        topicPerformance: true,
      },
    });
  }

  // --- Student ----------------------------------------------------------

  /** Starts an attempt and returns questions WITHOUT correct answers. */
  async startAttempt(userId: string, assessmentId: string) {
    const assessment = await this.prisma.assessment.findUnique({
      where: { id: assessmentId },
      include: { questions: { orderBy: { order: 'asc' }, include: { options: true } } },
    });
    if (!assessment) throw new NotFoundException('Assessment not found');
    if (assessment.status !== 'PUBLISHED') {
      throw new BadRequestException('This assessment is not open');
    }
    await this.assertEnrolled(userId, assessment.batchId);

    const priorCount = await this.prisma.assessmentAttempt.count({
      where: { assessmentId, studentId: userId },
    });
    if (priorCount >= assessment.maxAttempts) {
      throw new BadRequestException('You have used all allowed attempts');
    }

    const attempt = await this.prisma.assessmentAttempt.create({
      data: { assessmentId, studentId: userId, attemptNumber: priorCount + 1, status: 'IN_PROGRESS' },
    });

    let questions = assessment.questions.map((q) => ({
      id: q.id,
      type: q.type,
      prompt: q.prompt,
      topic: q.topic,
      points: q.points,
      // Options WITHOUT isCorrect — never leak the answer key to the client.
      options: q.options
        .sort((a, b) => a.order - b.order)
        .map((o) => ({ id: o.id, text: o.text })),
    }));
    if (assessment.shuffleQuestions) questions = shuffleDeterministic(questions, attempt.id);

    return {
      attemptId: attempt.id,
      title: assessment.title,
      timeLimitMin: assessment.timeLimitMin,
      questions,
    };
  }

  async submitAttempt(userId: string, attemptId: string, dto: SubmitAttemptDto) {
    const attempt = await this.prisma.assessmentAttempt.findUnique({
      where: { id: attemptId },
      include: { assessment: { include: { questions: { include: { options: true } } } } },
    });
    if (!attempt) throw new NotFoundException('Attempt not found');
    if (attempt.studentId !== userId) throw new ForbiddenException('Not your attempt');
    if (attempt.status !== 'IN_PROGRESS') throw new BadRequestException('Attempt already submitted');

    const questions: GradableQuestion[] = attempt.assessment.questions.map((q) => ({
      id: q.id,
      type: q.type,
      points: q.points,
      topic: q.topic,
      correctText: q.correctText,
      options: q.options.map((o) => ({ id: o.id, isCorrect: o.isCorrect })),
    }));
    const result = gradeAttempt(questions, dto.answers);

    await this.prisma.$transaction(async (tx) => {
      await tx.attemptAnswer.deleteMany({ where: { attemptId } });
      const answerByQuestion = new Map(dto.answers.map((a) => [a.questionId, a]));
      await tx.attemptAnswer.createMany({
        data: result.answers.map((g) => {
          const submitted = answerByQuestion.get(g.questionId);
          return {
            attemptId,
            questionId: g.questionId,
            selectedOptionIds: submitted?.selectedOptionIds ?? [],
            textAnswer: submitted?.textAnswer ?? null,
            isCorrect: g.isCorrect,
            pointsAwarded: g.pointsAwarded,
            needsReview: g.needsReview,
          };
        }),
      });
      await tx.topicPerformance.deleteMany({ where: { attemptId } });
      if (result.topics.length) {
        await tx.topicPerformance.createMany({
          data: result.topics.map((t) => ({ attemptId, ...t })),
        });
      }
      await tx.assessmentAttempt.update({
        where: { id: attemptId },
        data: {
          status: 'GRADED',
          score: result.score,
          maxScore: result.maxScore,
          percent: result.percent,
          submittedAt: new Date(),
          gradedAt: new Date(),
        },
      });
    });

    await this.audit.record({
      action: 'assessment.attempt.submit',
      actorUserId: userId,
      targetType: 'AssessmentAttempt',
      targetId: attemptId,
      metadata: { percent: result.percent, needsReview: result.needsReview },
    });

    // Topic-level performance now exists → refresh the student's skill profile
    // and composite scores (§16 → §17 → §20). Best-effort; never blocks the response.
    await this.skills.recomputeSafe(userId);
    await this.scores.recomputeSafe(userId);

    return {
      attemptId,
      score: result.score,
      maxScore: result.maxScore,
      percent: result.percent,
      needsReview: result.needsReview,
      topics: result.topics,
    };
  }

  async listMine(userId: string) {
    const links = await this.prisma.batchStudent.findMany({
      where: { userId, status: 'ACTIVE' },
      select: { batchId: true },
    });
    const batchIds = links.map((l) => l.batchId);
    if (batchIds.length === 0) return [];
    return this.prisma.assessment.findMany({
      where: { batchId: { in: batchIds }, status: 'PUBLISHED' },
      orderBy: [{ dueAt: 'asc' }, { createdAt: 'desc' }],
      include: {
        _count: { select: { questions: true } },
        attempts: {
          where: { studentId: userId },
          orderBy: { attemptNumber: 'desc' },
          take: 1,
          select: { id: true, status: true, percent: true, attemptNumber: true },
        },
      },
    });
  }

  async getMyAttempt(userId: string, attemptId: string) {
    const attempt = await this.prisma.assessmentAttempt.findUnique({
      where: { id: attemptId },
      include: {
        topicPerformance: true,
        assessment: { select: { title: true, passingScore: true } },
      },
    });
    if (!attempt) throw new NotFoundException('Attempt not found');
    if (attempt.studentId !== userId) throw new ForbiddenException('Not your attempt');
    return attempt;
  }
}

/** Deterministic shuffle seeded by attempt id (stable across reloads). */
function shuffleDeterministic<T>(arr: T[], seed: string): T[] {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    h = (h * 1103515245 + 12345) & 0x7fffffff;
    const j = h % (i + 1);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}
