import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { buildPaginationMeta, type Paginated } from '@fca/shared';
import { computePlacementReadiness, computeOpportunityMatch } from '@fca/analytics';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { UserContextService } from '../authz/user-context.service';
import { NotificationService } from '../notifications/notification.service';
import { assertOrgAccess } from '../common/tenant';
import type {
  CreateOpportunityDto,
  UpdateOpportunityDto,
  ListOpportunitiesQuery,
} from './dto/opportunity.schemas';

// Skill counts as "demonstrated" for matching at or above this mastery.
const STRONG_SKILL_THRESHOLD = 50;

/**
 * Placement opportunities (§26). Officers/recruiters manage postings for their
 * organization; students discover OPEN postings scoped to their org, annotated
 * with a deterministic eligibility (placement readiness) + skill match (§17).
 */
@Injectable()
export class OpportunitiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly userContext: UserContextService,
    private readonly notifications: NotificationService,
  ) {}

  // --- Staff management -------------------------------------------------

  async create(userId: string, dto: CreateOpportunityDto) {
    await assertOrgAccess(this.userContext, userId, dto.organizationId);
    const { organizationId, requirements, ...rest } = dto;
    const opportunity = await this.prisma.opportunity.create({
      data: {
        organizationId,
        postedById: userId,
        requirements: requirements ?? [],
        ...rest,
      },
    });
    await this.audit.record({
      action: 'opportunity.create',
      actorUserId: userId,
      organizationId,
      targetType: 'Opportunity',
      targetId: opportunity.id,
    });
    return opportunity;
  }

  async list(userId: string, query: ListOpportunitiesQuery): Promise<Paginated<unknown>> {
    await assertOrgAccess(this.userContext, userId, query.organizationId);
    const where = {
      organizationId: query.organizationId,
      ...(query.status ? { status: query.status } : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.opportunity.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: { postedBy: { select: { profile: { select: { firstName: true, lastName: true } } } } },
      }),
      this.prisma.opportunity.count({ where }),
    ]);
    return { data, meta: buildPaginationMeta(total, query.page, query.pageSize) };
  }

  async getForStaff(userId: string, id: string) {
    const opportunity = await this.loadOwned(userId, id);
    return opportunity;
  }

  async update(userId: string, id: string, dto: UpdateOpportunityDto) {
    await this.loadOwned(userId, id);
    return this.prisma.opportunity.update({ where: { id }, data: dto });
  }

  async publish(userId: string, id: string) {
    const opportunity = await this.loadOwned(userId, id);
    if (opportunity.status === 'OPEN') return opportunity;
    if (!opportunity.description || opportunity.title.length < 2) {
      throw new BadRequestException('Add a title and description before publishing');
    }
    const updated = await this.prisma.opportunity.update({
      where: { id },
      data: { status: 'OPEN', publishedAt: opportunity.publishedAt ?? new Date() },
    });
    await this.audit.record({
      action: 'opportunity.publish',
      actorUserId: userId,
      organizationId: opportunity.organizationId,
      targetType: 'Opportunity',
      targetId: id,
    });
    await this.notifyOpenToWork(opportunity.organizationId, updated.title, updated.companyName, id);
    return updated;
  }

  async close(userId: string, id: string) {
    const opportunity = await this.loadOwned(userId, id);
    if (opportunity.status === 'CLOSED') return opportunity;
    const updated = await this.prisma.opportunity.update({ where: { id }, data: { status: 'CLOSED' } });
    await this.audit.record({
      action: 'opportunity.close',
      actorUserId: userId,
      organizationId: opportunity.organizationId,
      targetType: 'Opportunity',
      targetId: id,
    });
    return updated;
  }

  // --- Student discovery ------------------------------------------------

  /** OPEN opportunities in the student's org(s), annotated with fit (§17, §26). */
  async discover(userId: string) {
    const orgIds = await this.userOrgIds(userId);
    if (orgIds.length === 0) return [];

    const [opportunities, readiness, skills] = await Promise.all([
      this.prisma.opportunity.findMany({
        where: { organizationId: { in: orgIds }, status: 'OPEN' },
        orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
        take: 100,
      }),
      computePlacementReadiness(this.prisma, userId),
      this.prisma.studentSkill.findMany({
        where: { userId, score: { gte: STRONG_SKILL_THRESHOLD } },
        select: { score: true, skill: { select: { name: true } } },
      }),
    ]);

    const strongSkills = skills.map((s) => ({ name: s.skill.name, score: s.score }));
    return opportunities.map((o) => ({
      ...o,
      match: computeOpportunityMatch({
        requirements: o.requirements,
        minReadiness: o.minReadiness,
        readinessScore: readiness.readinessScore,
        strongSkills,
      }),
    }));
  }

  async discoverOne(userId: string, id: string) {
    const orgIds = await this.userOrgIds(userId);
    const opportunity = await this.prisma.opportunity.findFirst({
      where: { id, status: 'OPEN', organizationId: { in: orgIds } },
    });
    if (!opportunity) throw new NotFoundException('Opportunity not found');
    const [readiness, skills] = await Promise.all([
      computePlacementReadiness(this.prisma, userId),
      this.prisma.studentSkill.findMany({
        where: { userId, score: { gte: STRONG_SKILL_THRESHOLD } },
        select: { score: true, skill: { select: { name: true } } },
      }),
    ]);
    return {
      ...opportunity,
      match: computeOpportunityMatch({
        requirements: opportunity.requirements,
        minReadiness: opportunity.minReadiness,
        readinessScore: readiness.readinessScore,
        strongSkills: skills.map((s) => ({ name: s.skill.name, score: s.score })),
      }),
    };
  }

  // --- Helpers ----------------------------------------------------------

  private async loadOwned(userId: string, id: string) {
    const opportunity = await this.prisma.opportunity.findUnique({ where: { id } });
    if (!opportunity) throw new NotFoundException('Opportunity not found');
    await assertOrgAccess(this.userContext, userId, opportunity.organizationId);
    return opportunity;
  }

  private async userOrgIds(userId: string): Promise<string[]> {
    const memberships = await this.prisma.organizationMember.findMany({
      where: { userId },
      select: { organizationId: true },
    });
    return memberships.map((m) => m.organizationId);
  }

  /**
   * Notify open-to-work students in the org when a posting goes live. Bounded to
   * students who have opted in via their career profile — best-effort, never
   * blocks publishing.
   */
  private async notifyOpenToWork(organizationId: string, title: string, company: string, opportunityId: string) {
    try {
      const members = await this.prisma.organizationMember.findMany({
        where: { organizationId, user: { careerProfile: { openToWork: true } } },
        select: { userId: true },
        take: 500,
      });
      await this.notifications.notifyMany(
        members.map((m) => m.userId),
        {
          type: 'PLACEMENT_OPPORTUNITY',
          title: 'New opportunity posted',
          body: `${title} at ${company} — see if you’re a match.`,
          deepLink: '/opportunities',
        },
      );
    } catch {
      // best-effort: publishing must not fail because notifications did
      void opportunityId;
    }
  }
}
