import { apiRequest } from './api-client';

export type RecommendationType =
  | 'SUBMIT_ASSIGNMENT'
  | 'BOOK_MENTOR'
  | 'RETAKE_QUIZ'
  | 'REVIEW_SKILL'
  | 'COMPLETE_LESSON'
  | 'KEEP_GOING';

export interface Recommendation {
  type: RecommendationType;
  priority: number;
  title: string;
  reason: string;
  deepLink: string;
  target?: { kind: string; id: string; label: string };
}

export const recommendationsApi = {
  mine: () => apiRequest<Recommendation[]>('/me/recommendations', { auth: true }),
};
