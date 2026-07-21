import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { UserContextService } from '../authz/user-context.service';
import { NotificationService } from '../notifications/notification.service';
import { assertOrgAccess } from '../common/tenant';
import type { CreateReferralDto, ReviewReferralDto } from './dto/referral.schemas';

const personSelect = {
  id: true,
  email: true,
  profile: { select: { firstName: true, lastName: true } },
};

/**
 * Referrals (§30) — the network vouching for its own. Alumni who opted in and
 * mentors may refer a student for a specific open opportunity; the vouch
 * surfaces to the placement officer next to that student's application. One
 * referral per (opportunity, student, referrer).
 */
@Injectable()
export class ReferralsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly userContext: UserContextService,
    private readonly notifications: NotificationService,
  ) {}

  /**
   * Only members of the network may vouch: an alumnus who opted into referrals,
   * or an active mentor. Staff use the application pipeline itself.
   */
  async canRefer(userId: string): Promise<boolean> {
    const [alumni, mentor] = await Promise.all([
      this.prisma.alumniProfile.findUnique({ where: { userId }, select: { openToReferrals: true } }),
      this.prisma.mentorProfile.findUnique({ where: { userId }, select: { id: true } }),
    ]);
    return Boolean(alumni?.openToReferrals || mentor);
  }

  private async assertCanRefer(userId: string): Promise<void> {
    if (await this.canRefer(userId)) return;
    throw new ForbiddenException(
      'Referrals are open to mentors and alumni who have enabled referrals on their profile',
    );
  }

  async create(referrerId: string, opportunityId: string, dto: CreateReferralDto) {
    await this.assertCanRefer(referrerId);

    const opportunity = await this.prisma.opportunity.findUnique({ where: { id: opportunityId } });
    if (!opportunity || opportunity.status !== 'OPEN') {
      throw new NotFoundException('Opportunity not found or not open');
    }
    // The referrer must belong to the opportunity's organization.
    await assertOrgAccess(this.userContext, referrerId, opportunity.organizationId);

    const student = dto.studentId
      ? await this.prisma.user.findUnique({ where: { id: dto.studentId } })
      : await this.prisma.user.findUnique({ where: { email: dto.studentEmail! } });
    if (!student) throw new NotFoundException('Student not found');
    if (student.id === referrerId) throw new BadRequestException('You cannot refer yourself');

    const studentInOrg = await this.prisma.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId: opportunity.organizationId, userId: student.id } },
    });
    if (!studentInOrg) throw new BadRequestException('That student is not in this organization');

    const existing = await this.prisma.referral.findUnique({
      where: {
        opportunityId_studentId_referrerId: { opportunityId, studentId: student.id, referrerId },
      },
    });
    if (existing) throw new ConflictException('You have already referred this student for this role');

    const referral = await this.prisma.referral.create({
      data: { opportunityId, studentId: student.id, referrerId, note: dto.note },
    });

    await this.audit.record({
      action: 'referral.create',
      actorUserId: referrerId,
      organizationId: opportunity.organizationId,
      targetType: 'Referral',
      targetId: referral.id,
    });
    // Encourage the student and flag the candidate to the poster.
    await this.notifications.notify(student.id, {
      type: 'PLACEMENT_OPPORTUNITY',
      title: 'You’ve been referred',
      body: `Someone in your network referred you for "${opportunity.title}" at ${opportunity.companyName}.`,
      deepLink: '/opportunities',
    });
    await this.notifications
      .notify(opportunity.postedById, {
        type: 'APPLICATION_UPDATE',
        title: 'A candidate was referred',
        body: `A network member vouched for a student on "${opportunity.title}".`,
        deepLink: '/opportunities',
      })
      .catch(() => undefined);

    return referral;
  }

  /** Referrals the caller made and received. */
  async mine(userId: string) {
    const opportunitySelect = {
      select: { id: true, title: true, companyName: true, status: true },
    };
    const [canRefer, made, received] = await Promise.all([
      this.canRefer(userId),
      this.prisma.referral.findMany({
        where: { referrerId: userId },
        orderBy: { createdAt: 'desc' },
        include: { opportunity: opportunitySelect, student: { select: personSelect } },
      }),
      this.prisma.referral.findMany({
        where: { studentId: userId },
        orderBy: { createdAt: 'desc' },
        include: { opportunity: opportunitySelect, referrer: { select: personSelect } },
      }),
    ]);
    return { canRefer, made, received };
  }

  /** Staff view: every vouch on an opportunity. */
  async listForOpportunity(actorId: string, opportunityId: string) {
    const opportunity = await this.prisma.opportunity.findUnique({ where: { id: opportunityId } });
    if (!opportunity) throw new NotFoundException('Opportunity not found');
    await assertOrgAccess(this.userContext, actorId, opportunity.organizationId);
    return this.prisma.referral.findMany({
      where: { opportunityId },
      orderBy: { createdAt: 'desc' },
      include: { student: { select: personSelect }, referrer: { select: personSelect } },
    });
  }

  async review(actorId: string, referralId: string, dto: ReviewReferralDto) {
    const referral = await this.prisma.referral.findUnique({
      where: { id: referralId },
      include: { opportunity: { select: { organizationId: true } } },
    });
    if (!referral) throw new NotFoundException('Referral not found');
    await assertOrgAccess(this.userContext, actorId, referral.opportunity.organizationId);
    if (referral.status !== 'PENDING') {
      throw new BadRequestException(`This referral is already ${referral.status.toLowerCase()}`);
    }
    return this.prisma.referral.update({
      where: { id: referralId },
      data: { status: dto.status, reviewedById: actorId, reviewedAt: new Date() },
    });
  }
}
