import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { buildPaginationMeta, type Paginated } from '@fca/shared';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationService } from '../notifications/notification.service';
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
  ) {}

  private async orgIds(userId: string): Promise<string[]> {
    const memberships = await this.prisma.organizationMember.findMany({
      where: { userId },
      select: { organizationId: true },
    });
    return memberships.map((m) => m.organizationId);
  }

  /** The org a member posts into (their primary/first membership). */
  private async primaryOrgId(userId: string): Promise<string> {
    const [primary] = await this.orgIds(userId);
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
          _count: { select: { answers: true } },
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
      where: { id, organizationId: { in: orgIds } },
      include: {
        author: { select: authorSelect },
        answers: {
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
      where: { id: questionId, organizationId: { in: orgIds } },
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

  /** Upvote toggle. One vote per member; you can't upvote your own answer. */
  async toggleVote(userId: string, answerId: string) {
    const orgIds = await this.orgIds(userId);
    const answer = await this.prisma.communityAnswer.findFirst({
      where: { id: answerId, question: { organizationId: { in: orgIds } } },
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
    const question = await this.prisma.communityQuestion.findUnique({ where: { id: questionId } });
    if (!question) throw new NotFoundException('Question not found');
    if (question.authorId !== userId) {
      throw new ForbiddenException('Only the person who asked can accept an answer');
    }
    const answer = await this.prisma.communityAnswer.findFirst({ where: { id: answerId, questionId } });
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
