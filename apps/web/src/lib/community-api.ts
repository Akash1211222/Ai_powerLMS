import { apiRequest } from './api-client';

export type QuestionStatus = 'OPEN' | 'ANSWERED' | 'CLOSED';

interface Author {
  id: string;
  email: string;
  profile: { firstName: string; lastName: string; avatarUrl: string | null } | null;
}

export interface QuestionSummary {
  id: string;
  title: string;
  body: string;
  tags: string[];
  status: QuestionStatus;
  viewCount: number;
  createdAt: string;
  author: Author;
  _count: { answers: number };
}

export interface Answer {
  id: string;
  body: string;
  isAccepted: boolean;
  createdAt: string;
  author: Author;
  voteCount: number;
  votedByMe: boolean;
}

export interface QuestionDetail extends Omit<QuestionSummary, '_count'> {
  answers: Answer[];
}

export interface Paginated<T> {
  data: T[];
  meta: { total: number; page: number; pageSize: number; totalPages: number };
}

export const communityApi = {
  list: (tag?: string) =>
    apiRequest<Paginated<QuestionSummary>>(
      `/community/questions${tag ? `?tag=${encodeURIComponent(tag)}` : ''}`,
      { auth: true },
    ),
  get: (id: string) => apiRequest<QuestionDetail>(`/community/questions/${id}`, { auth: true }),
  ask: (title: string, body: string, tags: string[]) =>
    apiRequest<QuestionSummary>('/community/questions', { method: 'POST', body: { title, body, tags }, auth: true }),
  answer: (questionId: string, body: string) =>
    apiRequest<Answer>(`/community/questions/${questionId}/answers`, { method: 'POST', body: { body }, auth: true }),
  vote: (answerId: string) =>
    apiRequest<{ answerId: string; votedByMe: boolean; voteCount: number }>(
      `/community/answers/${answerId}/vote`,
      { method: 'POST', auth: true },
    ),
  accept: (questionId: string, answerId: string) =>
    apiRequest<QuestionDetail>(`/community/questions/${questionId}/accept/${answerId}`, { method: 'POST', auth: true }),
  tags: () => apiRequest<Array<{ tag: string; count: number }>>('/community/tags', { auth: true }),
};
