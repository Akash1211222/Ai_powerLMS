import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { buildPaginationMeta, type Paginated } from '@fca/shared';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationService } from '../notifications/notification.service';
import type {
  CreateChannelDto,
  CreatePostDto,
  ListPostsQuery,
  CommentDto,
  CreateStudyRoomDto,
} from './dto/community.schemas';

export const authorSelect = {
  id: true,
  email: true,
  profile: { select: { firstName: true, lastName: true, avatarUrl: true } },
};

/**
 * Community feed — channels, posts, claps, comments, study rooms.
 */
@Injectable()
export class CommunityFeedService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationService,
  ) {}

  async orgIds(userId: string): Promise<string[]> {
    const memberships = await this.prisma.organizationMember.findMany({
      where: { userId },
      select: { organizationId: true },
    });
    return memberships.map((m) => m.organizationId);
  }

  async primaryOrgId(userId: string): Promise<string> {
    const membership = await this.prisma.organizationMember.findFirst({
      where: { userId },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
      select: { organizationId: true },
    });
    if (!membership) throw new ForbiddenException('You are not a member of any organization');
    return membership.organizationId;
  }

  // --- Channels -----------------------------------------------------------

  async listChannels(userId: string) {
    const orgIds = await this.orgIds(userId);
    if (orgIds.length === 0) return [];

    const channels = await this.prisma.communityChannel.findMany({
      where: { organizationId: { in: orgIds } },
      orderBy: { name: 'asc' },
      include: {
        members: { where: { userId }, select: { lastReadAt: true } },
        _count: { select: { posts: true } },
      },
    });

    const result = [];
    for (const ch of channels) {
      const lastRead = ch.members[0]?.lastReadAt ?? null;
      const unread = await this.prisma.communityPost.count({
        where: {
          channelId: ch.id,
          ...(lastRead ? { createdAt: { gt: lastRead } } : {}),
          authorId: { not: userId },
        },
      });
      result.push({
        id: ch.id,
        name: ch.name,
        slug: ch.slug,
        emoji: ch.emoji,
        kind: ch.kind,
        batchId: ch.batchId,
        postCount: ch._count.posts,
        unread: unread > 0 ? unread : 0,
        joined: ch.members.length > 0,
      });
    }
    return result;
  }

  async createChannel(userId: string, dto: CreateChannelDto) {
    const organizationId = await this.primaryOrgId(userId);
    const channel = await this.prisma.communityChannel.create({
      data: {
        organizationId,
        name: dto.name,
        slug: dto.slug,
        emoji: dto.emoji ?? '💬',
        kind: dto.kind ?? 'TOPIC',
        batchId: dto.batchId,
        members: { create: { userId } },
      },
    });
    return channel;
  }

  async joinChannel(userId: string, channelId: string) {
    const orgIds = await this.orgIds(userId);
    const channel = await this.prisma.communityChannel.findFirst({
      where: { id: channelId, organizationId: { in: orgIds } },
    });
    if (!channel) throw new NotFoundException('Channel not found');
    await this.prisma.communityChannelMember.upsert({
      where: { channelId_userId: { channelId, userId } },
      create: { channelId, userId, lastReadAt: new Date() },
      update: {},
    });
    return { success: true };
  }

  async markChannelRead(userId: string, channelId: string) {
    await this.prisma.communityChannelMember.updateMany({
      where: { channelId, userId },
      data: { lastReadAt: new Date() },
    });
    return { success: true };
  }

  // --- Posts --------------------------------------------------------------

  async listPosts(userId: string, query: ListPostsQuery): Promise<Paginated<unknown>> {
    const orgIds = await this.orgIds(userId);
    if (orgIds.length === 0) {
      return { data: [], meta: buildPaginationMeta(0, query.page, query.pageSize) };
    }
    const where = {
      organizationId: { in: orgIds },
      ...(query.channelId ? { channelId: query.channelId } : {}),
      ...(query.kind ? { kind: query.kind } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.communityPost.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: {
          author: { select: authorSelect },
          channel: { select: { id: true, name: true, emoji: true, slug: true } },
          _count: { select: { reactions: true, comments: true } },
          reactions: { where: { userId }, select: { userId: true } },
        },
      }),
      this.prisma.communityPost.count({ where }),
    ]);

    const data = rows.map(({ reactions, _count, ...p }) => ({
      ...p,
      clapCount: _count.reactions,
      commentCount: _count.comments,
      clappedByMe: reactions.length > 0,
    }));
    return { data, meta: buildPaginationMeta(total, query.page, query.pageSize) };
  }

  async getPost(userId: string, id: string) {
    const orgIds = await this.orgIds(userId);
    const post = await this.prisma.communityPost.findFirst({
      where: { id, organizationId: { in: orgIds } },
      include: {
        author: { select: authorSelect },
        channel: { select: { id: true, name: true, emoji: true, slug: true } },
        comments: {
          orderBy: { createdAt: 'asc' },
          include: { author: { select: authorSelect } },
        },
        _count: { select: { reactions: true, comments: true } },
        reactions: { where: { userId }, select: { userId: true } },
      },
    });
    if (!post) throw new NotFoundException('Post not found');
    const { reactions, _count, ...rest } = post;
    return {
      ...rest,
      clapCount: _count.reactions,
      commentCount: _count.comments,
      clappedByMe: reactions.length > 0,
    };
  }

  async createPost(userId: string, dto: CreatePostDto) {
    const organizationId = await this.primaryOrgId(userId);

    if (dto.channelId) {
      const ch = await this.prisma.communityChannel.findFirst({
        where: { id: dto.channelId, organizationId },
      });
      if (!ch) throw new NotFoundException('Channel not found');
    }

    let questionId: string | undefined;
    if (dto.kind === 'QUESTION') {
      const title = dto.title?.trim() || dto.body.slice(0, 80);
      if (title.length < 10) {
        throw new BadRequestException('Question posts need a title of at least 10 characters');
      }
      if (dto.body.trim().length < 20) {
        throw new BadRequestException('Question body must be at least 20 characters');
      }
      const q = await this.prisma.communityQuestion.create({
        data: {
          organizationId,
          authorId: userId,
          title,
          body: dto.body,
          tags: dto.tags ?? [],
        },
      });
      questionId = q.id;
    }

    const post = await this.prisma.communityPost.create({
      data: {
        organizationId,
        authorId: userId,
        channelId: dto.channelId ?? null,
        kind: dto.kind,
        title: dto.title,
        body: dto.body,
        questionId,
        showcaseTitle: dto.showcaseTitle,
        showcaseSub: dto.showcaseSub,
        showcaseEmoji: dto.showcaseEmoji,
      },
      include: {
        author: { select: authorSelect },
        channel: { select: { id: true, name: true, emoji: true, slug: true } },
      },
    });

    if (dto.channelId) {
      await this.prisma.communityChannelMember.upsert({
        where: { channelId_userId: { channelId: dto.channelId, userId } },
        create: { channelId: dto.channelId, userId, lastReadAt: new Date() },
        update: { lastReadAt: new Date() },
      });
    }

    return { ...post, clapCount: 0, commentCount: 0, clappedByMe: false };
  }

  async toggleClap(userId: string, postId: string) {
    const orgIds = await this.orgIds(userId);
    const post = await this.prisma.communityPost.findFirst({
      where: { id: postId, organizationId: { in: orgIds } },
      select: { id: true },
    });
    if (!post) throw new NotFoundException('Post not found');

    const existing = await this.prisma.communityPostReaction.findUnique({
      where: { postId_userId: { postId, userId } },
    });
    if (existing) {
      await this.prisma.communityPostReaction.delete({
        where: { postId_userId: { postId, userId } },
      });
    } else {
      await this.prisma.communityPostReaction.create({ data: { postId, userId } });
    }
    const clapCount = await this.prisma.communityPostReaction.count({ where: { postId } });
    return { postId, clappedByMe: !existing, clapCount };
  }

  async addComment(userId: string, postId: string, dto: CommentDto) {
    const orgIds = await this.orgIds(userId);
    const post = await this.prisma.communityPost.findFirst({
      where: { id: postId, organizationId: { in: orgIds } },
    });
    if (!post) throw new NotFoundException('Post not found');

    const comment = await this.prisma.communityPostComment.create({
      data: { postId, authorId: userId, body: dto.body },
      include: { author: { select: authorSelect } },
    });

    if (post.authorId !== userId) {
      await this.notifications
        .notify(post.authorId, {
          type: 'COMMUNITY_POST_COMMENT',
          title: 'New comment on your post',
          body: dto.body.slice(0, 120),
          deepLink: `/community/posts/${postId}`,
        })
        .catch(() => undefined);
    }
    return comment;
  }

  // --- Study rooms --------------------------------------------------------

  async listStudyRooms(userId: string) {
    const orgIds = await this.orgIds(userId);
    if (orgIds.length === 0) return [];
    const cutoff = new Date(Date.now() - 30 * 60_000);
    const rooms = await this.prisma.communityStudyRoom.findMany({
      where: { organizationId: { in: orgIds }, status: 'OPEN' },
      orderBy: { createdAt: 'desc' },
      include: {
        createdBy: { select: authorSelect },
        presence: {
          where: { leftAt: null, lastSeenAt: { gte: cutoff } },
          select: { userId: true },
        },
      },
    });
    return rooms.map((r) => ({
      id: r.id,
      title: r.title,
      meetingUrl: r.meetingUrl,
      channelId: r.channelId,
      createdBy: r.createdBy,
      studyingNow: r.presence.length,
      joinedByMe: r.presence.some((p) => p.userId === userId),
      createdAt: r.createdAt,
    }));
  }

  async createStudyRoom(userId: string, dto: CreateStudyRoomDto) {
    const organizationId = await this.primaryOrgId(userId);
    const room = await this.prisma.communityStudyRoom.create({
      data: {
        organizationId,
        createdById: userId,
        title: dto.title,
        channelId: dto.channelId ?? null,
        meetingUrl: dto.meetingUrl ?? null,
        presence: {
          create: { userId, lastSeenAt: new Date() },
        },
      },
    });
    return room;
  }

  async joinStudyRoom(userId: string, roomId: string) {
    const orgIds = await this.orgIds(userId);
    const room = await this.prisma.communityStudyRoom.findFirst({
      where: { id: roomId, organizationId: { in: orgIds }, status: 'OPEN' },
    });
    if (!room) throw new NotFoundException('Study room not found');
    await this.prisma.communityStudyRoomPresence.upsert({
      where: { roomId_userId: { roomId, userId } },
      create: { roomId, userId, lastSeenAt: new Date() },
      update: { leftAt: null, lastSeenAt: new Date() },
    });
    return { success: true, meetingUrl: room.meetingUrl };
  }

  async leaveStudyRoom(userId: string, roomId: string) {
    await this.prisma.communityStudyRoomPresence.updateMany({
      where: { roomId, userId },
      data: { leftAt: new Date() },
    });
    return { success: true };
  }

  async hubStats(userId: string) {
    const orgIds = await this.orgIds(userId);
    if (orgIds.length === 0) {
      return { postsThisWeek: 0, openRooms: 0, unreadDms: 0, upcomingEvents: 0 };
    }
    const weekAgo = new Date(Date.now() - 7 * 86_400_000);
    const now = new Date();
    const [postsThisWeek, openRooms, upcomingEvents, memberships] = await Promise.all([
      this.prisma.communityPost.count({
        where: { organizationId: { in: orgIds }, createdAt: { gte: weekAgo } },
      }),
      this.prisma.communityStudyRoom.count({
        where: { organizationId: { in: orgIds }, status: 'OPEN' },
      }),
      this.prisma.communityEvent.count({
        where: { organizationId: { in: orgIds }, startsAt: { gte: now } },
      }),
      this.prisma.conversationMember.findMany({
        where: { userId },
        select: { conversationId: true, lastReadAt: true },
      }),
    ]);

    let unreadDms = 0;
    for (const m of memberships) {
      const count = await this.prisma.communityMessage.count({
        where: {
          conversationId: m.conversationId,
          authorId: { not: userId },
          ...(m.lastReadAt ? { createdAt: { gt: m.lastReadAt } } : {}),
        },
      });
      if (count > 0) unreadDms += 1;
    }

    return { postsThisWeek, openRooms, unreadDms, upcomingEvents };
  }
}
