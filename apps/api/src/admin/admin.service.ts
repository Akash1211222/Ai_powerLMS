import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { buildPaginationMeta, type Paginated } from '@fca/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { UserContextService } from '../authz/user-context.service';
import { assertOrgAccess } from '../common/tenant';
import { PasswordService } from '../auth/password.service';
import { defaultPasswordForRole } from './member-passwords';
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
      return created;
    });

    await this.audit.record({
      action: 'admin.member.created',
      actorUserId: actorId,
      targetType: 'User',
      targetId: user.id,
    });

    return {
      id: user.id,
      email: user.email,
      firstName: dto.firstName,
      lastName: dto.lastName,
      role: dto.role,
      // Shown once so the admin can pass it on; never stored in plain text.
      password,
    };
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
