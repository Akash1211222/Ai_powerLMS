import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { computePlacementReadiness } from '@fca/analytics';
import { PrismaService } from '../prisma/prisma.service';
import { UserContextService } from '../authz/user-context.service';
import { assertStudentAccess } from '../common/tenant';
import type { ProjectDto, ExperienceDto, UpdateProfileDto } from './dto/career.schemas';

const profileInclude = {
  projects: { orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] },
  experiences: { orderBy: [{ order: 'asc' }, { startDate: 'desc' }] },
} satisfies import('@fca/database').Prisma.CareerProfileInclude;

/**
 * Career profile + resume assembly (§25). A student owns exactly one profile
 * (lazily created). The assembled resume joins the profile with the Phase 2
 * skill matrix + placement readiness — all deterministic, no AI.
 */
@Injectable()
export class CareerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly userContext: UserContextService,
  ) {}

  // --- Profile (owner) --------------------------------------------------

  /** Returns the caller's profile, creating an empty one on first access. */
  async getOrCreate(userId: string) {
    const existing = await this.prisma.careerProfile.findUnique({
      where: { userId },
      include: profileInclude,
    });
    if (existing) return existing;
    await this.prisma.careerProfile.create({ data: { userId } });
    return this.prisma.careerProfile.findUniqueOrThrow({ where: { userId }, include: profileInclude });
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    await this.getOrCreate(userId);
    await this.prisma.careerProfile.update({ where: { userId }, data: dto });
    return this.prisma.careerProfile.findUniqueOrThrow({ where: { userId }, include: profileInclude });
  }

  // --- Projects ---------------------------------------------------------

  async addProject(userId: string, dto: ProjectDto) {
    const profile = await this.getOrCreate(userId);
    return this.prisma.careerProject.create({
      data: { profileId: profile.id, ...dto, skills: dto.skills ?? [] },
    });
  }

  async updateProject(userId: string, projectId: string, dto: ProjectDto) {
    await this.assertOwnsProject(userId, projectId);
    return this.prisma.careerProject.update({
      where: { id: projectId },
      data: { ...dto, skills: dto.skills ?? [] },
    });
  }

  async deleteProject(userId: string, projectId: string) {
    await this.assertOwnsProject(userId, projectId);
    await this.prisma.careerProject.delete({ where: { id: projectId } });
    return { success: true };
  }

  // --- Experiences ------------------------------------------------------

  async addExperience(userId: string, dto: ExperienceDto) {
    const profile = await this.getOrCreate(userId);
    return this.prisma.careerExperience.create({
      data: { profileId: profile.id, ...dto, endDate: dto.current ? null : (dto.endDate ?? null) },
    });
  }

  async updateExperience(userId: string, experienceId: string, dto: ExperienceDto) {
    await this.assertOwnsExperience(userId, experienceId);
    return this.prisma.careerExperience.update({
      where: { id: experienceId },
      data: { ...dto, endDate: dto.current ? null : (dto.endDate ?? null) },
    });
  }

  async deleteExperience(userId: string, experienceId: string) {
    await this.assertOwnsExperience(userId, experienceId);
    await this.prisma.careerExperience.delete({ where: { id: experienceId } });
    return { success: true };
  }

  // --- Resume assembly --------------------------------------------------

  /**
   * The deterministic resume view (§25) — the profile joined with the top
   * skills (Phase 2 matrix) and placement readiness. Shared by the owner and
   * the staff/officer drill-down.
   */
  async resume(userId: string) {
    const [profile, skills, readiness, user] = await Promise.all([
      this.getOrCreate(userId),
      this.prisma.studentSkill.findMany({
        where: { userId, evidenceCount: { gt: 0 } },
        orderBy: { score: 'desc' },
        take: 12,
        select: { score: true, skill: { select: { name: true } } },
      }),
      computePlacementReadiness(this.prisma, userId),
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { email: true, profile: { select: { firstName: true, lastName: true, avatarUrl: true } } },
      }),
    ]);

    return {
      identity: {
        name: user?.profile ? `${user.profile.firstName} ${user.profile.lastName}` : (user?.email ?? ''),
        email: user?.email ?? '',
        avatarUrl: user?.profile?.avatarUrl ?? null,
      },
      profile,
      topSkills: skills.map((s) => ({ name: s.skill.name, score: s.score })),
      readiness: { readinessScore: readiness.readinessScore, tier: readiness.tier },
    };
  }

  // --- Staff view -------------------------------------------------------

  /** Staff/officer view of a student's profile, tenant-scoped + visibility-aware. */
  async getStudentProfile(actorId: string, studentId: string) {
    await assertStudentAccess(this.userContext, this.prisma, actorId, studentId);
    const profile = await this.prisma.careerProfile.findUnique({
      where: { userId: studentId },
      include: profileInclude,
    });
    if (!profile || profile.visibility === 'PRIVATE') {
      throw new NotFoundException('This student has no shared career profile');
    }
    return this.resume(studentId);
  }

  // --- Guards -----------------------------------------------------------

  private async assertOwnsProject(userId: string, projectId: string) {
    const project = await this.prisma.careerProject.findUnique({
      where: { id: projectId },
      select: { profile: { select: { userId: true } } },
    });
    if (!project) throw new NotFoundException('Project not found');
    if (project.profile.userId !== userId) throw new ForbiddenException('Not your project');
  }

  private async assertOwnsExperience(userId: string, experienceId: string) {
    const exp = await this.prisma.careerExperience.findUnique({
      where: { id: experienceId },
      select: { profile: { select: { userId: true } } },
    });
    if (!exp) throw new NotFoundException('Experience not found');
    if (exp.profile.userId !== userId) throw new ForbiddenException('Not your experience');
  }
}
