import { Injectable } from '@nestjs/common';
import {
  computeContributionScore,
  earnedBadges,
  BADGE_BY_CODE,
  type ContributionCounts,
} from '@fca/analytics';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationService } from '../notifications/notification.service';

const LEADERBOARD_SIZE = 10;

/**
 * Reputation (§32). Contribution scores are derived live from real activity
 * (§17) — nothing to keep in sync. Achievements are persisted so each badge is
 * announced exactly once, and awarding is idempotent.
 */
@Injectable()
export class ReputationService {
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

  /** Raw contribution counts for one member. */
  private async countsFor(userId: string): Promise<ContributionCounts> {
    const [answers, acceptedAnswers, questionsAsked, referralsMade, mentoringSessions, upvotesReceived] =
      await Promise.all([
        this.prisma.communityAnswer.count({ where: { authorId: userId } }),
        this.prisma.communityAnswer.count({ where: { authorId: userId, isAccepted: true } }),
        this.prisma.communityQuestion.count({ where: { authorId: userId } }),
        this.prisma.referral.count({ where: { referrerId: userId, status: { not: 'DECLINED' } } }),
        this.prisma.mentorBooking.count({ where: { mentorId: userId, status: 'COMPLETED' } }),
        this.prisma.communityAnswerVote.count({ where: { answer: { authorId: userId } } }),
      ]);
    return { answers, acceptedAnswers, questionsAsked, referralsMade, mentoringSessions, upvotesReceived };
  }

  /**
   * Awards any newly earned badges and announces them once. Safe to call on
   * every read — `createMany` with skipDuplicates makes it idempotent.
   */
  private async syncAchievements(userId: string, counts: ContributionCounts, score: number) {
    const earned = earnedBadges(counts, score);
    const existing = await this.prisma.achievement.findMany({
      where: { userId },
      select: { code: true, awardedAt: true },
    });
    const have = new Set(existing.map((a) => a.code));
    const fresh = earned.filter((code) => !have.has(code));

    if (fresh.length > 0) {
      await this.prisma.achievement.createMany({
        data: fresh.map((code) => ({ userId, code })),
        skipDuplicates: true,
      });
      for (const code of fresh) {
        const badge = BADGE_BY_CODE.get(code);
        await this.notifications
          .notify(userId, {
            type: 'ACHIEVEMENT',
            title: `Achievement unlocked: ${badge?.label ?? code} 🏅`,
            body: badge?.description ?? 'You earned a new achievement.',
            deepLink: '/community',
          })
          .catch(() => undefined);
      }
    }

    const all = await this.prisma.achievement.findMany({
      where: { userId },
      orderBy: { awardedAt: 'asc' },
    });
    return {
      badges: all.map((a) => ({
        code: a.code,
        label: BADGE_BY_CODE.get(a.code)?.label ?? a.code,
        description: BADGE_BY_CODE.get(a.code)?.description ?? '',
        awardedAt: a.awardedAt,
      })),
      newlyAwarded: fresh,
    };
  }

  /** The caller's contribution score, breakdown and badges. */
  async mine(userId: string) {
    const counts = await this.countsFor(userId);
    const contribution = computeContributionScore(counts);
    const { badges, newlyAwarded } = await this.syncAchievements(userId, counts, contribution.score);
    return { ...contribution, badges, newlyAwarded };
  }

  /**
   * Top contributors in the caller's organization. Scores for everyone are
   * built from a handful of grouped aggregates rather than per-user queries.
   */
  async leaderboard(userId: string) {
    const orgIds = await this.orgIds(userId);
    if (orgIds.length === 0) return [];

    const members = await this.prisma.organizationMember.findMany({
      where: { organizationId: { in: orgIds } },
      select: { userId: true },
      distinct: ['userId'],
      take: 500,
    });
    const memberIds = members.map((m) => m.userId);
    if (memberIds.length === 0) return [];

    const [answers, accepted, questions, referrals, mentoring, votes, users] = await Promise.all([
      this.prisma.communityAnswer.groupBy({
        by: ['authorId'],
        where: { authorId: { in: memberIds } },
        _count: { _all: true },
      }),
      this.prisma.communityAnswer.groupBy({
        by: ['authorId'],
        where: { authorId: { in: memberIds }, isAccepted: true },
        _count: { _all: true },
      }),
      this.prisma.communityQuestion.groupBy({
        by: ['authorId'],
        where: { authorId: { in: memberIds } },
        _count: { _all: true },
      }),
      this.prisma.referral.groupBy({
        by: ['referrerId'],
        where: { referrerId: { in: memberIds }, status: { not: 'DECLINED' } },
        _count: { _all: true },
      }),
      this.prisma.mentorBooking.groupBy({
        by: ['mentorId'],
        where: { mentorId: { in: memberIds }, status: 'COMPLETED' },
        _count: { _all: true },
      }),
      // Votes are counted per answer, then rolled up to that answer's author.
      this.prisma.communityAnswer.findMany({
        where: { authorId: { in: memberIds } },
        select: { authorId: true, _count: { select: { votes: true } } },
      }),
      this.prisma.user.findMany({
        where: { id: { in: memberIds } },
        select: { id: true, email: true, profile: { select: { firstName: true, lastName: true, avatarUrl: true } } },
      }),
    ]);

    const tally = <T extends string>(
      rows: Array<Record<T, string> & { _count: { _all: number } }>,
      key: T,
    ) => new Map(rows.map((r) => [r[key], r._count._all]));

    const answerCounts = tally(answers, 'authorId');
    const acceptedCounts = tally(accepted, 'authorId');
    const questionCounts = tally(questions, 'authorId');
    const referralCounts = tally(referrals, 'referrerId');
    const mentoringCounts = tally(mentoring, 'mentorId');
    const voteCounts = new Map<string, number>();
    for (const a of votes) voteCounts.set(a.authorId, (voteCounts.get(a.authorId) ?? 0) + a._count.votes);

    return users
      .map((u) => {
        const counts: ContributionCounts = {
          answers: answerCounts.get(u.id) ?? 0,
          acceptedAnswers: acceptedCounts.get(u.id) ?? 0,
          questionsAsked: questionCounts.get(u.id) ?? 0,
          referralsMade: referralCounts.get(u.id) ?? 0,
          mentoringSessions: mentoringCounts.get(u.id) ?? 0,
          upvotesReceived: voteCounts.get(u.id) ?? 0,
        };
        const { score } = computeContributionScore(counts);
        return {
          userId: u.id,
          name: u.profile ? `${u.profile.firstName} ${u.profile.lastName}` : u.email,
          avatarUrl: u.profile?.avatarUrl ?? null,
          score,
          badgeCount: earnedBadges(counts, score).length,
        };
      })
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
      .slice(0, LEADERBOARD_SIZE);
  }
}
