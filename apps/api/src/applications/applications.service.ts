import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { computePlacementReadiness, computeOpportunityMatch } from '@fca/analytics';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { UserContextService } from '../authz/user-context.service';
import { NotificationService } from '../notifications/notification.service';
import { assertOrgAccess } from '../common/tenant';
import type { ApplyDto, UpdateStatusDto } from './dto/application.schemas';

const STRONG_SKILL_THRESHOLD = 50;
const TERMINAL = new Set(['HIRED', 'REJECTED', 'WITHDRAWN']);

/**
 * Applications pipeline (§27). Students apply to OPEN opportunities they are
 * eligible for (placement-readiness gate); reviewers advance them through
 * stages, and every decision notifies the student. One application per
 * (opportunity, student); terminal states are immutable.
 */
@Injectable()
export class ApplicationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly userContext: UserContextService,
    private readonly notifications: NotificationService,
  ) {}

  // --- Student ----------------------------------------------------------

  async apply(userId: string, opportunityId: string, dto: ApplyDto) {
    const opportunity = await this.prisma.opportunity.findUnique({ where: { id: opportunityId } });
    if (!opportunity || opportunity.status !== 'OPEN') {
      throw new NotFoundException('Opportunity not found or not open');
    }
    // Must belong to the opportunity's org.
    const member = await this.prisma.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId: opportunity.organizationId, userId } },
    });
    if (!member) throw new ForbiddenException('This opportunity is not open to you');

    const existing = await this.prisma.application.findUnique({
      where: { opportunityId_studentId: { opportunityId, studentId: userId } },
    });
    if (existing) throw new ConflictException('You have already applied to this opportunity');

    // Deterministic eligibility gate (§17, §26) — can't apply below the bar.
    const [readiness, skills] = await Promise.all([
      computePlacementReadiness(this.prisma, userId),
      this.prisma.studentSkill.findMany({
        where: { userId, score: { gte: STRONG_SKILL_THRESHOLD } },
        select: { score: true, skill: { select: { name: true } } },
      }),
    ]);
    const match = computeOpportunityMatch({
      requirements: opportunity.requirements,
      minReadiness: opportunity.minReadiness,
      readinessScore: readiness.readinessScore,
      strongSkills: skills.map((s) => ({ name: s.skill.name, score: s.score })),
    });
    if (!match.eligible) {
      throw new BadRequestException(
        `Your placement readiness (${readiness.readinessScore}) is below this role's requirement (${opportunity.minReadiness}).`,
      );
    }

    const application = await this.prisma.application.create({
      data: {
        opportunityId,
        studentId: userId,
        coverNote: dto.coverNote ?? null,
        readinessSnapshot: readiness.readinessScore,
        matchSnapshot: match.matchScore,
      },
    });
    await this.audit.record({
      action: 'application.create',
      actorUserId: userId,
      organizationId: opportunity.organizationId,
      targetType: 'Application',
      targetId: application.id,
    });
    // Best-effort: let the poster know a candidate applied.
    await this.notifications
      .notify(opportunity.postedById, {
        type: 'APPLICATION_UPDATE',
        title: 'New application received',
        body: `A student applied to "${opportunity.title}".`,
        deepLink: '/opportunities',
      })
      .catch(() => undefined);
    return application;
  }

  async listMine(userId: string) {
    return this.prisma.application.findMany({
      where: { studentId: userId },
      orderBy: { createdAt: 'desc' },
      include: {
        opportunity: { select: { id: true, title: true, companyName: true, status: true, workMode: true, type: true } },
      },
    });
  }

  async withdraw(userId: string, applicationId: string) {
    const application = await this.prisma.application.findUnique({ where: { id: applicationId } });
    if (!application) throw new NotFoundException('Application not found');
    if (application.studentId !== userId) throw new ForbiddenException('Not your application');
    if (TERMINAL.has(application.status)) {
      throw new BadRequestException('This application can no longer be withdrawn');
    }
    return this.prisma.application.update({ where: { id: applicationId }, data: { status: 'WITHDRAWN' } });
  }

  // --- Staff ------------------------------------------------------------

  async listForOpportunity(actorId: string, opportunityId: string) {
    const opportunity = await this.prisma.opportunity.findUnique({ where: { id: opportunityId } });
    if (!opportunity) throw new NotFoundException('Opportunity not found');
    await assertOrgAccess(this.userContext, actorId, opportunity.organizationId);
    const [applications, referrals] = await Promise.all([
      this.prisma.application.findMany({
        where: { opportunityId },
        orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
        include: {
          student: { select: { id: true, email: true, profile: { select: { firstName: true, lastName: true } } } },
        },
      }),
      // Network vouches on this role, so reviewers see who was referred (§30).
      this.prisma.referral.findMany({
        where: { opportunityId, status: { not: 'DECLINED' } },
        select: { studentId: true },
      }),
    ]);
    const vouches = new Map<string, number>();
    for (const r of referrals) vouches.set(r.studentId, (vouches.get(r.studentId) ?? 0) + 1);
    return applications.map((a) => ({ ...a, referralCount: vouches.get(a.studentId) ?? 0 }));
  }

  async updateStatus(actorId: string, applicationId: string, dto: UpdateStatusDto) {
    const application = await this.prisma.application.findUnique({
      where: { id: applicationId },
      include: { opportunity: { select: { organizationId: true, title: true } } },
    });
    if (!application) throw new NotFoundException('Application not found');
    await assertOrgAccess(this.userContext, actorId, application.opportunity.organizationId);
    if (TERMINAL.has(application.status)) {
      throw new BadRequestException(`This application is already ${application.status.toLowerCase()}`);
    }

    const updated = await this.prisma.application.update({
      where: { id: applicationId },
      data: {
        status: dto.status,
        decisionNote: dto.decisionNote ?? null,
        reviewedById: actorId,
        reviewedAt: new Date(),
      },
    });
    await this.audit.record({
      action: 'application.status',
      actorUserId: actorId,
      organizationId: application.opportunity.organizationId,
      targetType: 'Application',
      targetId: applicationId,
      metadata: { status: dto.status },
    });
    await this.notifications.notify(application.studentId, {
      type: 'APPLICATION_UPDATE',
      title: 'Application update',
      body: `Your application for "${application.opportunity.title}" is now ${humanize(dto.status)}.`,
      deepLink: '/opportunities',
    });
    return updated;
  }
}

function humanize(status: string): string {
  return status.toLowerCase().replace(/_/g, ' ');
}
