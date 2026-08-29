import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { buildPaginationMeta, type Paginated, outranks, type RoleName } from '@fca/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { UserContextService } from '../authz/user-context.service';
import { assertOrgAccess } from '../common/tenant';
import { PasswordService } from '../auth/password.service';
import { randomBytes } from 'node:crypto';
import { defaultPasswordForRole, temporaryPassword } from './member-passwords';
import type {
  ListMembersQuery,
  GrantRoleDto,
  RevokeRoleDto,
  CreateMemberDto,
} from './dto/admin.schemas';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly userContext: UserContextService,
    private readonly passwords: PasswordService,
  ) {}

  /**
   * Create a member. This replaces self-registration: the account is ACTIVE
   * and pre-verified immediately (nobody is waiting on a verification email),
   * gets its org membership and role in one transaction, and the issued
   * password is returned once so the admin can hand it over.
   */
  async createMember(actorId: string, dto: CreateMemberDto) {
    await assertOrgAccess(this.userContext, actorId, dto.organizationId);
    if (dto.role === 'SUPER_ADMIN') {
      throw new BadRequestException('Cannot create a SUPER_ADMIN via this API');
    }

    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('An account with this email already exists');

    const role = await this.prisma.role.findUnique({ where: { name: dto.role } });
    if (!role) throw new NotFoundException('Role not found');

    /**
     * Everything the account is being given must belong to the organisation it
     * is being created in. Without this an admin could hand their own student
     * a seat in another college's batch simply by pasting an id — the tenant
     * check above guards the organisation, not the ids inside the request.
     */
    const recordedCourseIds = [...new Set(dto.recordedCourseIds ?? [])];
    const batchIds = [...new Set(dto.batchIds ?? [])];

    if (recordedCourseIds.length > 0) {
      const found = await this.prisma.course.findMany({
        where: { id: { in: recordedCourseIds }, organizationId: dto.organizationId },
        select: { id: true },
      });
      if (found.length !== recordedCourseIds.length) {
        throw new BadRequestException('A selected course does not belong to this organization');
      }
    }

    // A batch carries the course it runs, so the live seat needs no separate
    // course choice — reading it here also keeps the enrolment consistent.
    const batches = batchIds.length
      ? await this.prisma.batch.findMany({
          where: { id: { in: batchIds }, organizationId: dto.organizationId },
          select: { id: true, courseId: true },
        })
      : [];
    if (batches.length !== batchIds.length) {
      throw new BadRequestException('A selected batch does not belong to this organization');
    }

    const password = defaultPasswordForRole(dto.role);
    const passwordHash = await this.passwords.hash(password);

    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email: dto.email,
          passwordHash,
          status: 'ACTIVE',
          emailVerifiedAt: new Date(),
          // The issued password is a shared, well-known role default, so the
          // member must replace it before the API will do anything else.
          mustChangePassword: true,
          profile: { create: { firstName: dto.firstName, lastName: dto.lastName } },
          orgMemberships: { create: { organizationId: dto.organizationId, isPrimary: true } },
        },
      });
      await tx.userRole.create({
        data: { userId: created.id, roleId: role.id, organizationId: dto.organizationId },
      });

      /**
       * A live seat already carries its course's material, and a person can
       * only be enrolled in a course once. So a course that is also covered by
       * a chosen batch is not a second, batch-less enrolment — it is the same
       * enrolment, and the batch is the more specific of the two.
       */
      const liveCourseIds = new Set(batches.map((b) => b.courseId));
      for (const courseId of recordedCourseIds) {
        if (liveCourseIds.has(courseId)) continue;
        await tx.enrollment.create({ data: { userId: created.id, courseId } });
      }

      // A live seat is both an enrolment against the batch's course and a place
      // on the roster, which is what attendance and grading read.
      for (const batch of batches) {
        await tx.enrollment.create({
          data: { userId: created.id, courseId: batch.courseId, batchId: batch.id },
        });
        await tx.batchStudent.create({ data: { batchId: batch.id, userId: created.id } });
      }

      return created;
    });

    await this.audit.record({
      action: 'admin.member.created',
      actorUserId: actorId,
      targetType: 'User',
      targetId: user.id,
      metadata: {
        role: dto.role,
        recordedCourses: recordedCourseIds.length,
        liveBatches: batches.length,
      },
    });

    return {
      id: user.id,
      email: user.email,
      firstName: dto.firstName,
      lastName: dto.lastName,
      role: dto.role,
      recordedCourseIds,
      batchIds: batches.map((b) => b.id),
      // Shown once so the admin can pass it on; never stored in plain text.
      password,
    };
  }

  /**
   * May the actor act on this member — reset their password, or later open
   * their account as them?
   *
   * Two questions, both necessary. Do they share a college, so a batch manager
   * at one campus cannot touch a student at another; and does the actor
   * outrank the target, so peers cannot take over each other's accounts and
   * nobody reaches a super admin. Permissions alone answer neither: they say
   * what somebody may do, never to whom.
   */
  private async assertCanActOnMember(actorId: string, targetUserId: string) {
    if (actorId === targetUserId) {
      throw new BadRequestException('Use the change-password endpoint for your own account');
    }

    const principal = await this.userContext.getPrincipal(actorId);
    const [actorRoles, targetRoles, targetOrgs] = await Promise.all([
      this.prisma.userRole.findMany({ where: { userId: actorId }, include: { role: true } }),
      this.prisma.userRole.findMany({ where: { userId: targetUserId }, include: { role: true } }),
      this.prisma.organizationMember.findMany({
        where: { userId: targetUserId },
        select: { organizationId: true },
      }),
    ]);

    if (targetOrgs.length === 0 && !principal.isSuperAdmin) {
      throw new NotFoundException('Member not found');
    }
    if (
      !principal.isSuperAdmin &&
      !targetOrgs.some((o) => principal.organizationIds.has(o.organizationId))
    ) {
      // Same wording as a missing member: whether an account exists elsewhere
      // is not this caller's business.
      throw new NotFoundException('Member not found');
    }

    const actorNames = actorRoles.map((r) => r.role.name as RoleName);
    const targetNames = targetRoles.map((r) => r.role.name as RoleName);
    if (!outranks(actorNames, targetNames)) {
      throw new ForbiddenException('You cannot act on this member');
    }
    return { targetNames };
  }

  /**
   * Issue a new temporary password for a member who cannot get in.
   *
   * The stored password is an argon2 hash and cannot be turned back into text,
   * so "show me their password" is not a thing any system can do. This is the
   * answer to the same need: a fresh password, shown once, that the member must
   * replace on first use.
   *
   * Existing sessions are cut. Someone asking for a reset may be locked out
   * because their account was taken, and leaving the thief's session alive
   * would make the reset theatre.
   */
  async resetMemberPassword(actorId: string, targetUserId: string) {
    await this.assertCanActOnMember(actorId, targetUserId);

    const target = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, email: true },
    });
    if (!target) throw new NotFoundException('Member not found');

    const password = temporaryPassword(randomBytes);
    const passwordHash = await this.passwords.hash(password);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: target.id },
        data: { passwordHash, mustChangePassword: true },
      }),
      this.prisma.session.updateMany({
        where: { userId: target.id, revokedAt: null },
        data: { revokedAt: new Date(), revokedReason: 'PASSWORD_RESET' },
      }),
    ]);

    await this.audit.record({
      action: 'admin.member.password_reset',
      actorUserId: actorId,
      targetType: 'User',
      targetId: target.id,
    });

    // Shown once. Nothing stores it, and asking again issues a different one.
    return { id: target.id, email: target.email, password };
  }

  async listMembers(userId: string, query: ListMembersQuery): Promise<Paginated<unknown>> {
    await assertOrgAccess(this.userContext, userId, query.organizationId);
    const where = { organizationId: query.organizationId };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.organizationMember.findMany({
        where,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: { createdAt: 'asc' },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              status: true,
              profile: true,
              roles: {
                where: { organizationId: query.organizationId },
                include: { role: { select: { name: true } } },
              },
            },
          },
        },
      }),
      this.prisma.organizationMember.count({ where }),
    ]);
    const data = rows.map((m) => ({
      id: m.id,
      isPrimary: m.isPrimary,
      createdAt: m.createdAt,
      user: {
        id: m.user.id,
        email: m.user.email,
        status: m.user.status,
        profile: m.user.profile,
        roles: m.user.roles.map((r) => r.role.name),
      },
    }));
    return { data, meta: buildPaginationMeta(total, query.page, query.pageSize) };
  }

  async grantRole(actorId: string, dto: GrantRoleDto) {
    await assertOrgAccess(this.userContext, actorId, dto.organizationId);
    if (dto.role === 'SUPER_ADMIN') {
      throw new BadRequestException('Cannot grant SUPER_ADMIN via org admin API');
    }
    const role = await this.prisma.role.findUnique({ where: { name: dto.role } });
    if (!role) throw new NotFoundException('Role not found');

    const member = await this.prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: { organizationId: dto.organizationId, userId: dto.userId },
      },
    });
    if (!member) throw new BadRequestException('User is not a member of this organization');

    const existing = await this.prisma.userRole.findFirst({
      where: {
        userId: dto.userId,
        roleId: role.id,
        organizationId: dto.organizationId,
      },
    });
    if (existing) throw new ConflictException('User already has this role');

    const granted = await this.prisma.userRole.create({
      data: {
        userId: dto.userId,
        roleId: role.id,
        organizationId: dto.organizationId,
      },
    });
    await this.audit.record({
      action: 'user.role.grant',
      actorUserId: actorId,
      organizationId: dto.organizationId,
      targetType: 'User',
      targetId: dto.userId,
      metadata: { role: dto.role },
    });
    return granted;
  }

  async revokeRole(actorId: string, dto: RevokeRoleDto) {
    await assertOrgAccess(this.userContext, actorId, dto.organizationId);
    if (dto.role === 'SUPER_ADMIN') {
      throw new BadRequestException('Cannot revoke SUPER_ADMIN via org admin API');
    }
    const role = await this.prisma.role.findUnique({ where: { name: dto.role } });
    if (!role) throw new NotFoundException('Role not found');

    const existing = await this.prisma.userRole.findFirst({
      where: {
        userId: dto.userId,
        roleId: role.id,
        organizationId: dto.organizationId,
      },
    });
    if (!existing) throw new NotFoundException('Role assignment not found');

    await this.prisma.userRole.delete({ where: { id: existing.id } });
    await this.audit.record({
      action: 'user.role.revoke',
      actorUserId: actorId,
      organizationId: dto.organizationId,
      targetType: 'User',
      targetId: dto.userId,
      metadata: { role: dto.role },
    });
    return { success: true };
  }

  async listFlags() {
    return this.prisma.featureFlag.findMany({ orderBy: { key: 'asc' } });
  }

  async updateFlag(actorId: string, key: string, enabled: boolean) {
    const flag = await this.prisma.featureFlag.findUnique({ where: { key } });
    if (!flag) throw new NotFoundException('Feature flag not found');
    const updated = await this.prisma.featureFlag.update({
      where: { key },
      data: { enabled },
    });
    await this.audit.record({
      action: 'feature-flag.update',
      actorUserId: actorId,
      targetType: 'FeatureFlag',
      targetId: flag.id,
      metadata: { key, enabled },
    });
    return updated;
  }
}
