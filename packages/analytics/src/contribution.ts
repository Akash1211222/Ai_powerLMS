export const CONTRIBUTION_VERSION = 1;

export interface ContributionCounts {
  answers: number;
  acceptedAnswers: number;
  upvotesReceived: number;
  questionsAsked: number;
  referralsMade: number;
  mentoringSessions: number;
}

export interface ContributionBreakdown {
  key: keyof ContributionCounts;
  label: string;
  count: number;
  points: number;
}

export interface Contribution {
  score: number;
  counts: ContributionCounts;
  breakdown: ContributionBreakdown[];
  version: number;
}

// Points per contribution. Weighted by how much effort the act represents and
// how much it helps someone else: running a mentoring session or having an
// answer accepted is worth far more than asking a question.
const WEIGHTS: Array<{ key: keyof ContributionCounts; label: string; points: number }> = [
  { key: 'mentoringSessions', label: 'Mentoring sessions', points: 20 },
  { key: 'acceptedAnswers', label: 'Accepted answers', points: 15 },
  { key: 'referralsMade', label: 'Referrals made', points: 10 },
  { key: 'answers', label: 'Answers given', points: 5 },
  { key: 'upvotesReceived', label: 'Upvotes received', points: 2 },
  { key: 'questionsAsked', label: 'Questions asked', points: 1 },
];

export interface BadgeDefinition {
  code: string;
  label: string;
  description: string;
}

/**
 * Badge thresholds. Deterministic and monotonic — once the underlying counts
 * reach a threshold the badge is earned and never un-earned.
 */
const BADGE_RULES: Array<BadgeDefinition & { earned: (c: ContributionCounts, score: number) => boolean }> = [
  {
    code: 'FIRST_ANSWER',
    label: 'First Answer',
    description: 'Answered your first community question',
    earned: (c) => c.answers >= 1,
  },
  {
    code: 'KNOWLEDGE_SHARER',
    label: 'Knowledge Sharer',
    description: 'Answered 5 community questions',
    earned: (c) => c.answers >= 5,
  },
  {
    code: 'PROBLEM_SOLVER',
    label: 'Problem Solver',
    description: 'Had an answer accepted as the solution',
    earned: (c) => c.acceptedAnswers >= 1,
  },
  {
    code: 'WELL_REGARDED',
    label: 'Well Regarded',
    description: 'Earned 10 upvotes on your answers',
    earned: (c) => c.upvotesReceived >= 10,
  },
  {
    code: 'CONNECTOR',
    label: 'Connector',
    description: 'Referred someone for an opportunity',
    earned: (c) => c.referralsMade >= 1,
  },
  {
    code: 'MENTOR',
    label: 'Mentor',
    description: 'Completed a mentoring session',
    earned: (c) => c.mentoringSessions >= 1,
  },
  {
    code: 'TOP_CONTRIBUTOR',
    label: 'Top Contributor',
    description: 'Reached 100 contribution points',
    earned: (_c, score) => score >= 100,
  },
];

export const BADGES: BadgeDefinition[] = BADGE_RULES.map(({ code, label, description }) => ({
  code,
  label,
  description,
}));

export const BADGE_BY_CODE = new Map(BADGES.map((b) => [b.code, b]));

/**
 * Deterministic contribution score (§17, §32) — what a member has given back to
 * the network. Pure: the same counts always yield the same score and the same
 * explainable breakdown.
 */
export function computeContributionScore(counts: ContributionCounts): Contribution {
  const breakdown = WEIGHTS.map(({ key, label, points }) => ({
    key,
    label,
    count: counts[key],
    points: counts[key] * points,
  }));
  return {
    score: breakdown.reduce((sum, b) => sum + b.points, 0),
    counts,
    breakdown,
    version: CONTRIBUTION_VERSION,
  };
}

/** Which badge codes these counts have earned. */
export function earnedBadges(counts: ContributionCounts, score: number): string[] {
  return BADGE_RULES.filter((b) => b.earned(counts, score)).map((b) => b.code);
}
