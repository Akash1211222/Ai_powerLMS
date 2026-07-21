import { describe, it, expect } from 'vitest';
import { computeContributionScore, earnedBadges, BADGES, type ContributionCounts } from './contribution';

const zero: ContributionCounts = {
  answers: 0,
  acceptedAnswers: 0,
  upvotesReceived: 0,
  questionsAsked: 0,
  referralsMade: 0,
  mentoringSessions: 0,
};

describe('computeContributionScore', () => {
  it('scores nothing for no contribution', () => {
    const c = computeContributionScore(zero);
    expect(c.score).toBe(0);
    expect(c.breakdown.every((b) => b.points === 0)).toBe(true);
  });

  it('weights helping others above asking', () => {
    const asking = computeContributionScore({ ...zero, questionsAsked: 5 });
    const helping = computeContributionScore({ ...zero, acceptedAnswers: 1 });
    expect(helping.score).toBeGreaterThan(asking.score);
  });

  it('sums each contribution by its weight, explainably', () => {
    const c = computeContributionScore({
      answers: 2, // 10
      acceptedAnswers: 1, // 15
      upvotesReceived: 3, // 6
      questionsAsked: 4, // 4
      referralsMade: 1, // 10
      mentoringSessions: 2, // 40
    });
    expect(c.score).toBe(85);
    const byKey = Object.fromEntries(c.breakdown.map((b) => [b.key, b.points]));
    expect(byKey.mentoringSessions).toBe(40);
    expect(byKey.acceptedAnswers).toBe(15);
    // Every weighted category is represented in the breakdown.
    expect(c.breakdown).toHaveLength(6);
  });
});

describe('earnedBadges', () => {
  it('awards nothing at zero', () => {
    expect(earnedBadges(zero, 0)).toEqual([]);
  });

  it('awards threshold badges as counts grow', () => {
    expect(earnedBadges({ ...zero, answers: 1 }, 5)).toContain('FIRST_ANSWER');
    expect(earnedBadges({ ...zero, answers: 5 }, 25)).toContain('KNOWLEDGE_SHARER');
    expect(earnedBadges({ ...zero, acceptedAnswers: 1 }, 15)).toContain('PROBLEM_SOLVER');
    expect(earnedBadges({ ...zero, upvotesReceived: 10 }, 20)).toContain('WELL_REGARDED');
    expect(earnedBadges({ ...zero, referralsMade: 1 }, 10)).toContain('CONNECTOR');
    expect(earnedBadges({ ...zero, mentoringSessions: 1 }, 20)).toContain('MENTOR');
  });

  it('awards TOP_CONTRIBUTOR on score, not on any single count', () => {
    expect(earnedBadges({ ...zero, mentoringSessions: 4 }, 80)).not.toContain('TOP_CONTRIBUTOR');
    expect(earnedBadges({ ...zero, mentoringSessions: 5 }, 100)).toContain('TOP_CONTRIBUTOR');
  });

  it('only ever returns known badge codes', () => {
    const known = new Set(BADGES.map((b) => b.code));
    const all = earnedBadges(
      { answers: 99, acceptedAnswers: 99, upvotesReceived: 99, questionsAsked: 99, referralsMade: 99, mentoringSessions: 99 },
      9999,
    );
    expect(all.length).toBe(BADGES.length);
    expect(all.every((c) => known.has(c))).toBe(true);
  });
});
