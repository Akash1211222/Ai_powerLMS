import { apiRequest } from './api-client';

export interface StudentScore {
  performanceScore: number;
  engagementScore: number;
  consistencyScore: number;
  skillMasteryScore: number;
  overallScore: number;
  components: Record<string, unknown> | null;
  computedAt: string;
}

export const scoresApi = {
  mine: () => apiRequest<StudentScore | null>('/me/score', { auth: true }),
};
