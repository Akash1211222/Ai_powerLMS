import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { buildPaginationMeta, type Paginated } from '@fca/shared';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationService } from '../notifications/notification.service';
import { authorSelect, CommunityFeedService } from './community-feed.service';
import type {
  CreateConversationDto,
  SendMessageDto,
  CreateGroupDto,
  CreateEventDto,
  RsvpDto,
  ListEventsQuery,
} from './dto/community.schemas';

/**
 * Community social — DMs, groups, events + RSVP.
 */
@Injectable()
export class CommunitySocialService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationService,
    private readonly feed: CommunityFeedService,
  ) {}

  // --- Conversations / messages -------------------------------------------

  async listConversations(userId: string) {
    const memberships = await this.prisma.conversationMember.findMany({
      where: { userId },
      include: {
        conversation: {
          include: {
            members: {
              include: { user: { select: authorSelect } },
            },
            group: { select: { id: true, name: true } },
            messages: {
              orderBy: { createdAt: 'desc' },
              take: 1,
              include: { author: { select: authorSelect } },
            },
          },
        },
      },
      orderBy: { conversation: { updatedAt: 'desc' } },
    });

    return memberships.map((m) => {
      const c = m.conversation;
      const others = c.members.filter((x) => x.userId !== userId).map((x) => x.user);
      const last = c.messages[0] ?? null;
      const title =
        c.kind === 'GROUP_CHAT'
          ? c.group?.name ?? 'Group chat'
          : others[0]
            ? others[0].profile
              ? `${others[0].profile.firstName} ${others[0].profile.lastName}`
              : others[0].email
            : 'Conversation';
      return {
        id: c.id,
        kind: c.kind,
        title,
        groupId: c.groupId,
        members: c.members.map((x) => x.user),
        lastMessage: last
          ? { id: last.id, body: last.body, createdAt: last.createdAt, author: last.author }
          : null,
        lastReadAt: m.lastReadAt,
        updatedAt: c.updatedAt,
      };
    });
  }

  async openConversation(userId: string, dto: CreateConversationDto) {
    const organizationId = await this.feed.primaryOrgId(userId);

    if (dto.groupId) {
      const membership = await this.prisma.communityGroupMember.findUnique({
        where: { groupId_userId: { groupId: dto.groupId, userId } },
      });
      if (!membership) throw new ForbiddenException('Join the group first');
      let conv = await this.prisma.conversation.findUnique({ where: { groupId: dto.groupId } });
      if (!conv) {
        const group = await this.prisma.communityGroup.findFirst({
          where: { id: dto.groupId, organizationId },
          include: { members: true },
        });
        if (!group) throw new NotFoundException('Group not found');
        conv = await this.prisma.conversation.create({
          data: {
            organizationId,
            kind: 'GROUP_CHAT',
            groupId: dto.groupId,
            createdById: userId,
            members: {
              create: group.members.map((m) => ({ userId: m.userId })),
            },
          },
        });
      }
      if (dto.body?.trim()) {
        await this.sendMessage(userId, conv.id, { body: dto.body.trim() });
      }
      return this.getConversation(userId, conv.id);
    }

    if (!dto.userId) throw new BadRequestException('Provide userId for a DM or groupId for group chat');
    if (dto.userId === userId) throw new BadRequestException('Cannot DM yourself');

    const peer = await this.prisma.organizationMember.findFirst({
      where: { userId: dto.userId, organizationId },
    });
    if (!peer) throw new NotFoundException('User is not in your organization');

    const existing = await this.prisma.conversation.findFirst({
      where: {
        organizationId,
        kind: 'DM',
        AND: [
          { members: { some: { userId } } },
          { members: { some: { userId: dto.userId } } },
        ],
      },
    });
    if (existing) {
      if (dto.body?.trim()) {
        await this.sendMessage(userId, existing.id, { body: dto.body.trim() });
      }
      return this.getConversation(userId, existing.id);
    }

    const conv = await this.prisma.conversation.create({
      data: {
        organizationId,
        kind: 'DM',
        createdById: userId,
        members: {
          create: [{ userId }, { userId: dto.userId }],
        },
      },
    });
    if (dto.body?.trim()) {
      await this.sendMessage(userId, conv.id, { body: dto.body.trim() });
    }
    return this.getConversation(userId, conv.id);
  }

  async getConversation(userId: string, id: string) {
    const member = await this.prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId: id, userId } },
    });
    if (!member) throw new NotFoundException('Conversation not found');

    const conversation = await this.prisma.conversation.findUnique({
      where: { id },
      include: {
        members: { include: { user: { select: authorSelect } } },
        group: { select: { id: true, name: true } },
      },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');
    return conversation;
  }

  async listMessages(userId: string, conversationId: string, page = 1, pageSize = 50) {
    await this.getConversation(userId, conversationId);
    const where = { conversationId };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.communityMessage.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { author: { select: authorSelect } },
      }),
      this.prisma.communityMessage.count({ where }),
    ]);
    await this.prisma.conversationMember.update({
      where: { conversationId_userId: { conversationId, userId } },
      data: { lastReadAt: new Date() },
    });
    return { data, meta: buildPaginationMeta(total, page, pageSize) };
  }

  async sendMessage(userId: string, conversationId: string, dto: SendMessageDto) {
    const conv = await this.getConversation(userId, conversationId);
    const message = await this.prisma.communityMessage.create({
      data: { conversationId, authorId: userId, body: dto.body },
      include: { author: { select: authorSelect } },
    });
    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });
    await this.prisma.conversationMember.update({
      where: { conversationId_userId: { conversationId, userId } },
      data: { lastReadAt: new Date() },
    });

    const peers = conv.members.filter((m) => m.userId !== userId);
    await Promise.all(
      peers.map((p) =>
        this.notifications
          .notify(p.userId, {
            type: 'COMMUNITY_MESSAGE',
            title: 'New community message',
            body: dto.body.slice(0, 120),
            deepLink: `/community?tab=messages&c=${conversationId}`,
          })
          .catch(() => undefined),
      ),
    );
    return message;
  }

  // --- Groups -------------------------------------------------------------

  async listGroups(userId: string) {
    const orgIds = await this.feed.orgIds(userId);
    if (orgIds.length === 0) return [];
    const groups = await this.prisma.communityGroup.findMany({
      where: { organizationId: { in: orgIds } },
      orderBy: { createdAt: 'desc' },
      include: {
        createdBy: { select: authorSelect },
        members: { where: { userId }, select: { role: true } },
        _count: { select: { members: true } },
      },
    });
    return groups.map((g) => ({
      id: g.id,
      name: g.name,
      description: g.description,
      visibility: g.visibility,
      createdBy: g.createdBy,
      memberCount: g._count.members,
      joined: g.members.length > 0,
      myRole: g.members[0]?.role ?? null,
      createdAt: g.createdAt,
    }));
  }

  async getGroup(userId: string, id: string) {
    const orgIds = await this.feed.orgIds(userId);
    const group = await this.prisma.communityGroup.findFirst({
      where: { id, organizationId: { in: orgIds } },
      include: {
        createdBy: { select: authorSelect },
        members: {
          include: { user: { select: authorSelect } },
          orderBy: { joinedAt: 'asc' },
        },
      },
    });
    if (!group) throw new NotFoundException('Group not found');
    return {
      ...group,
      joined: group.members.some((m) => m.userId === userId),
      myRole: group.members.find((m) => m.userId === userId)?.role ?? null,
    };
  }

  async createGroup(userId: string, dto: CreateGroupDto) {
    const organizationId = await this.feed.primaryOrgId(userId);
    const group = await this.prisma.communityGroup.create({
      data: {
        organizationId,
        createdById: userId,
        name: dto.name,
        description: dto.description,
        visibility: dto.visibility ?? 'OPEN',
        members: { create: { userId, role: 'OWNER' } },
      },
    });
    return group;
  }

  async joinGroup(userId: string, groupId: string) {
    const orgIds = await this.feed.orgIds(userId);
    const group = await this.prisma.communityGroup.findFirst({
      where: { id: groupId, organizationId: { in: orgIds } },
    });
    if (!group) throw new NotFoundException('Group not found');
    if (group.visibility === 'REQUEST') {
      // v1: auto-join even for REQUEST (no approval queue yet)
    }
    await this.prisma.communityGroupMember.upsert({
      where: { groupId_userId: { groupId, userId } },
      create: { groupId, userId, role: 'MEMBER' },
      update: {},
    });

    if (group.createdById !== userId) {
      await this.notifications
        .notify(group.createdById, {
          type: 'COMMUNITY_GROUP_INVITE',
          title: 'Someone joined your group',
          body: `A member joined "${group.name}".`,
          deepLink: `/community/groups/${groupId}`,
        })
        .catch(() => undefined);
    }
    return { success: true };
  }

  // --- Events -------------------------------------------------------------

  async listEvents(userId: string, query: ListEventsQuery): Promise<Paginated<unknown>> {
    const orgIds = await this.feed.orgIds(userId);
    if (orgIds.length === 0) {
      return { data: [], meta: buildPaginationMeta(0, query.page, query.pageSize) };
    }
    const where = { organizationId: { in: orgIds } };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.communityEvent.findMany({
        where,
        orderBy: { startsAt: 'asc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: {
          createdBy: { select: authorSelect },
          rsvps: { where: { userId }, select: { status: true } },
          _count: { select: { rsvps: true } },
        },
      }),
      this.prisma.communityEvent.count({ where }),
    ]);
    const data = rows.map(({ rsvps, _count, ...e }) => ({
      ...e,
      rsvpCount: _count.rsvps,
      myRsvp: rsvps[0]?.status ?? null,
    }));
    return { data, meta: buildPaginationMeta(total, query.page, query.pageSize) };
  }

  async createEvent(userId: string, dto: CreateEventDto) {
    const organizationId = await this.feed.primaryOrgId(userId);
    const event = await this.prisma.communityEvent.create({
      data: {
        organizationId,
        createdById: userId,
        title: dto.title,
        description: dto.description,
        startsAt: new Date(dto.startsAt),
        endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
        location: dto.location ?? null,
        meetingUrl: dto.meetingUrl ?? null,
        rsvps: { create: { userId, status: 'GOING' } },
      },
    });
    return event;
  }

  async rsvp(userId: string, eventId: string, dto: RsvpDto) {
    const orgIds = await this.feed.orgIds(userId);
    const event = await this.prisma.communityEvent.findFirst({
      where: { id: eventId, organizationId: { in: orgIds } },
    });
    if (!event) throw new NotFoundException('Event not found');
    await this.prisma.communityEventRsvp.upsert({
      where: { eventId_userId: { eventId, userId } },
      create: { eventId, userId, status: dto.status },
      update: { status: dto.status },
    });
    return { success: true, status: dto.status };
  }
}
