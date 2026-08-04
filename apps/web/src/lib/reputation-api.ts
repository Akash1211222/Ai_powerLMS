import { apiRequest } from './api-client';

export interface ContributionBreakdown {
  key: string;
  label: string;
  count: number;
  points: number;
}

export interface Badge {
  code: string;
  label: string;
  description: string;
  awardedAt: string;
}

export interface Reputation {
  score: number;
  counts: Record<string, number>;
  breakdown: ContributionBreakdown[];
  badges: Badge[];
  newlyAwarded: string[];
  version: number;
}

export interface LeaderboardRow {
  userId: string;
  name: string;
  avatarUrl: string | null;
  score: number;
  badgeCount: number;
}

export const reputationApi = {
  mine: () => apiRequest<Reputation>('/me/reputation', { auth: true }),
  leaderboard: () => apiRequest<LeaderboardRow[]>('/community/leaderboard', { auth: true }),
};
