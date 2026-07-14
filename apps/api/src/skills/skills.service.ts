import { Injectable, ForbiddenException, type OnModuleInit, Logger } from '@nestjs/common';
import { ensureSkillTaxonomy, recomputeStudentSkills, computeAndStoreStudentScore } from '@fca/analytics';
import { PrismaService } from '../prisma/prisma.service';
import { UserContextService } from '../authz/user-context.service';
import { isMemberOf } from '../authz/principal';

@Injectable()
export class SkillsService implements OnModuleInit {
  private readonly logger = new Logger(SkillsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly userContext: UserContextService,
  ) {}

  /** Ensure the reference taxonomy exists whenever the API boots (§20). */
  async onModuleInit(): Promise<void> {
    try {
      await ensureSkillTaxonomy(this.prisma);
    } catch (err) {
      this.logger.warn(`Skill taxonomy init skipped: ${(err as Error).message}`);
    }
  }

  async getTaxonomy() {
    const categories = await this.prisma.skillCategory.findMany({
      orderBy: { order: 'asc' },
      include: { skills: { orderBy: { name: 'asc' }, select: { id: true, name: true, slug: true } } },
    });
    return categories;
  }

  /** A user's own skill profile (grouped by category). */
  async getUserSkills(userId: string) {
    const skills = await this.prisma.studentSkill.findMany({
      where: { userId },
      orderBy: { score: 'desc' },
      include: { skill: { include: { category: true } } },
    });
    return skills.map((s) => ({
      skillId: s.skillId,
      name: s.skill.name,
      category: s.skill.category.name,
      score: s.score,
      confidence: s.confidence,
      evidenceCount: s.evidenceCount,
      trend: s.trend,
      lastEvaluatedAt: s.lastEvaluatedAt,
    }));
  }

  /** Verify the actor may view this student (shared org, or super admin). */
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

  /** Staff view of a student's skills, including evidence (§9 drill-down). */
  async getStudentSkills(actorId: string, studentId: string) {
    await this.assertCanViewStudent(actorId, studentId);
    const skills = await this.prisma.studentSkill.findMany({
      where: { userId: studentId },
      orderBy: { score: 'asc' }, // weakest first — the trainer's priority
      include: { skill: { include: { category: true } }, evidence: true },
    });
    return skills.map((s) => ({
      name: s.skill.name,
      category: s.skill.category.name,
      score: s.score,
      confidence: s.confidence,
      trend: s.trend,
      evidence: s.evidence.map((e) => ({
        sourceType: e.sourceType,
        topic: e.topic,
        correct: e.correct,
        total: e.total,
      })),
    }));
  }

  async recompute(actorId: string, studentId: string) {
    await this.assertCanViewStudent(actorId, studentId);
    return recomputeStudentSkills(this.prisma, studentId);
  }

  /** Bulk recompute for every student with graded attempts (super-admin ops). */
  async recomputeAll(actorId: string) {
    const principal = await this.userContext.getPrincipal(actorId);
    if (!principal.isSuperAdmin) throw new ForbiddenException('Super admin only');
    const students = await this.prisma.assessmentAttempt.findMany({
      where: { status: 'GRADED' },
      select: { studentId: true },
      distinct: ['studentId'],
    });
    let updated = 0;
    for (const s of students) {
      const res = await recomputeStudentSkills(this.prisma, s.studentId);
      await computeAndStoreStudentScore(this.prisma, s.studentId);
      if (res.updated > 0) updated++;
    }
    return { students: updated };
  }

  /** Best-effort recompute triggered by events (e.g. an assessment graded). */
  async recomputeSafe(studentId: string): Promise<void> {
    try {
      await recomputeStudentSkills(this.prisma, studentId);
    } catch (err) {
      this.logger.warn(`Skill recompute failed for ${studentId}: ${(err as Error).message}`);
    }
  }
}
