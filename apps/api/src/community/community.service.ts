import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { buildPaginationMeta, type Paginated } from '@fca/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationService } from '../notifications/notification.service';
import { resolvePrimaryOrgId } from '../common/tenant';
import type { AskDto, AnswerDto, ListQuestionsQuery } from './dto/community.schemas';

const authorSelect = {
  id: true,
  email: true,
  profile: { select: { firstName: true, lastName: true, avatarUrl: true } },
};

/**
 * Community Q&A (§31). An organization-scoped knowledge base: members ask,
 * peers/alumni/trainers answer, upvotes surface the best answer and the asker
 * accepts one. Value compounds — every answered question stays searchable.
 */
@Injectable()
export class CommunityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationService,
    private readonly audit: AuditService,
  ) {}

  private async orgIds(userId: string): Promise<string[]> {
    const memberships = await this.prisma.organizationMember.findMany({
      where: { userId },
      select: { organizationId: true },
    });
    return memberships.map((m) => m.organizationId);
  }

  /**
   * The org a member posts into. Delegates so this matches every other
   * primary-org lookup: it previously took the first row of an unordered
   * findMany, which Postgres is free to return in any sequence.
   */
  private async primaryOrgId(userId: string): Promise<string> {
    const primary = await resolvePrimaryOrgId(this.prisma, userId);
    if (!primary) throw new ForbiddenException('You are not a member of any organization');
    return primary;
  }

  // --- Questions --------------------------------------------------------

  async ask(userId: string, dto: AskDto) {
    const organizationId = await this.primaryOrgId(userId);
    return this.prisma.communityQuestion.create({
      data: {
        organizationId,
        authorId: userId,
        title: dto.title,
        body: dto.body,
        tags: dto.tags ?? [],
      },
    });
  }

  async list(userId: string, query: ListQuestionsQuery): Promise<Paginated<unknown>> {
    const orgIds = await this.orgIds(userId);
    if (orgIds.length === 0) {
      return { data: [], meta: buildPaginationMeta(0, query.page, query.pageSize) };
    }
    const where = {
      organizationId: { in: orgIds },
      removedAt: null,
      ...(query.status ? { status: query.status } : {}),
      ...(query.tag ? { tags: { has: query.tag } } : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.communityQuestion.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: {
          author: { select: authorSelect },
          _count: { select: { answers: { where: { removedAt: null } } } },
        },
      }),
      this.prisma.communityQuestion.count({ where }),
    ]);
    return { data, meta: buildPaginationMeta(total, query.page, query.pageSize) };
  }

  /** One question with its answers, vote counts and the caller's own vote. */
  async get(userId: string, id: string) {
    const orgIds = await this.orgIds(userId);
    const question = await this.prisma.communityQuestion.findFirst({
      // removedAt matters as much here as in the listing: without it a
      // moderated question stays readable to anyone holding its link.
      where: { id, removedAt: null, organizationId: { in: orgIds } },
      include: {
        author: { select: authorSelect },
        answers: {
          where: { removedAt: null },
          orderBy: [{ isAccepted: 'desc' }, { createdAt: 'asc' }],
          include: {
            author: { select: authorSelect },
            _count: { select: { votes: true } },
            votes: { where: { userId }, select: { userId: true } },
          },
        },
      },
    });
    if (!question) throw new NotFoundException('Question not found');

    // Views are a soft signal; failure must never break a read.
    await this.prisma.communityQuestion
      .update({ where: { id }, data: { viewCount: { increment: 1 } } })
      .catch(() => undefined);

    return {
      ...question,
      answers: question.answers.map(({ votes, _count, ...a }) => ({
        ...a,
        voteCount: _count.votes,
        votedByMe: votes.length > 0,
      })),
    };
  }

  // --- Answers ----------------------------------------------------------

  async answer(userId: string, questionId: string, dto: AnswerDto) {
    const orgIds = await this.orgIds(userId);
    const question = await this.prisma.communityQuestion.findFirst({
      where: { id: questionId, organizationId: { in: orgIds }, removedAt: null },
    });
    if (!question) throw new NotFoundException('Question not found');
    if (question.status === 'CLOSED') throw new BadRequestException('This question is closed');

    const answer = await this.prisma.communityAnswer.create({
      data: { questionId, authorId: userId, body: dto.body },
    });

    if (question.authorId !== userId) {
      await this.notifications
        .notify(question.authorId, {
          type: 'GENERAL',
          title: 'New answer to your question',
          body: `Someone answered "${question.title}".`,
          deepLink: `/community/${questionId}`,
        })
        .catch(() => undefined);
    }
    return answer;
  }

  // ---- Moderation (COMMUNITY_MODERATE) -----------------------------------
  //
  // Soft removal. The row survives so the audit trail is intact and an
  // accepted-answer link cannot dangle; every read filters removedAt: null.
  //
  // Scope is enforced the same way the rest of this service does it — the
  // content must belong to an organization the moderator is a member of — so
  // holding the permission does not let a trainer moderate another college.

  async removePost(userId: string, postId: string) {
    const orgIds = await this.orgIds(userId);
    const post = await this.prisma.communityPost.findFirst({
      where: { id: postId, organizationId: { in: orgIds }, removedAt: null },
      select: { id: true, organizationId: true, authorId: true },
    });
    if (!post) throw new NotFoundException('Post not found');

    await this.prisma.communityPost.update({
      where: { id: post.id },
      data: { removedAt: new Date(), removedById: userId },
    });
    await this.audit.record({
      action: 'community.post.removed',
      actorUserId: userId,
      organizationId: post.organizationId,
      targetType: 'CommunityPost',
      targetId: post.id,
      metadata: { authorId: post.authorId },
    });
    return { id: post.id, removed: true };
  }

  async removeQuestion(userId: string, questionId: string) {
    const orgIds = await this.orgIds(userId);
    const question = await this.prisma.communityQuestion.findFirst({
      where: { id: questionId, organizationId: { in: orgIds }, removedAt: null },
      select: { id: true, organizationId: true, authorId: true },
    });
    if (!question) throw new NotFoundException('Question not found');

    await this.prisma.communityQuestion.update({
      where: { id: question.id },
      data: { removedAt: new Date(), removedById: userId },
    });
    await this.audit.record({
      action: 'community.question.removed',
      actorUserId: userId,
      organizationId: question.organizationId,
      targetType: 'CommunityQuestion',
      targetId: question.id,
      metadata: { authorId: question.authorId },
    });
    return { id: question.id, removed: true };
  }

  async removeAnswer(userId: string, answerId: string) {
    const orgIds = await this.orgIds(userId);
    const answer = await this.prisma.communityAnswer.findFirst({
      where: {
        id: answerId,
        removedAt: null,
        question: { organizationId: { in: orgIds } },
      },
      select: { id: true, authorId: true, isAccepted: true, questionId: true },
    });
    if (!answer) throw new NotFoundException('Answer not found');

    await this.prisma.$transaction([
      this.prisma.communityAnswer.update({
        where: { id: answer.id },
        data: { removedAt: new Date(), removedById: userId, isAccepted: false },
      }),
      // Removing the accepted answer must not leave the question claiming it
      // is answered when nothing visible answers it.
      ...(answer.isAccepted
        ? [
            this.prisma.communityQuestion.update({
              where: { id: answer.questionId },
              data: { status: 'OPEN' as const },
            }),
          ]
        : []),
    ]);
    await this.audit.record({
      action: 'community.answer.removed',
      actorUserId: userId,
      targetType: 'CommunityAnswer',
      targetId: answer.id,
      metadata: { authorId: answer.authorId, wasAccepted: answer.isAccepted },
    });
    return { id: answer.id, removed: true };
  }

  /** Upvote toggle. One vote per member; you can't upvote your own answer. */
  async toggleVote(userId: string, answerId: string) {
    const orgIds = await this.orgIds(userId);
    const answer = await this.prisma.communityAnswer.findFirst({
      where: { id: answerId, removedAt: null, question: { organizationId: { in: orgIds } } },
      select: { id: true, authorId: true },
    });
    if (!answer) throw new NotFoundException('Answer not found');
    if (answer.authorId === userId) throw new BadRequestException('You cannot upvote your own answer');

    const existing = await this.prisma.communityAnswerVote.findUnique({
      where: { answerId_userId: { answerId, userId } },
    });
    if (existing) {
      await this.prisma.communityAnswerVote.delete({ where: { answerId_userId: { answerId, userId } } });
    } else {
      await this.prisma.communityAnswerVote.create({ data: { answerId, userId } });
    }
    const voteCount = await this.prisma.communityAnswerVote.count({ where: { answerId } });
    return { answerId, votedByMe: !existing, voteCount };
  }

  /** The asker marks the answer that solved it; the question becomes ANSWERED. */
  async accept(userId: string, questionId: string, answerId: string) {
    const question = await this.prisma.communityQuestion.findFirst({
      where: { id: questionId, removedAt: null },
    });
    if (!question) throw new NotFoundException('Question not found');
    if (question.authorId !== userId) {
      throw new ForbiddenException('Only the person who asked can accept an answer');
    }
    const answer = await this.prisma.communityAnswer.findFirst({
      where: { id: answerId, questionId, removedAt: null },
    });
    if (!answer) throw new NotFoundException('Answer not found on this question');

    await this.prisma.$transaction([
      // Exactly one accepted answer per question.
      this.prisma.communityAnswer.updateMany({ where: { questionId }, data: { isAccepted: false } }),
      this.prisma.communityAnswer.update({ where: { id: answerId }, data: { isAccepted: true } }),
      this.prisma.communityQuestion.update({ where: { id: questionId }, data: { status: 'ANSWERED' } }),
    ]);

    if (answer.authorId !== userId) {
      await this.notifications
        .notify(answer.authorId, {
          type: 'ACHIEVEMENT',
          title: 'Your answer was accepted 🎉',
          body: `Your answer solved "${question.title}".`,
          deepLink: `/community/${questionId}`,
        })
        .catch(() => undefined);
    }
    return this.get(userId, questionId);
  }

  /** Popular tags across the caller's organizations — the archive's shape. */
  async tags(userId: string) {
    const orgIds = await this.orgIds(userId);
    if (orgIds.length === 0) return [];
    const questions = await this.prisma.communityQuestion.findMany({
      where: { organizationId: { in: orgIds } },
      select: { tags: true },
      take: 500,
    });
    const counts = new Map<string, number>();
    for (const q of questions) for (const t of q.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
    return [...counts.entries()]
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
      .slice(0, 20);
  }
}
