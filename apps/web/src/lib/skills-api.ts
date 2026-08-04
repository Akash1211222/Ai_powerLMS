import { apiRequest } from './api-client';

export interface StudentSkill {
  skillId: string;
  name: string;
  category: string;
  score: number;
  confidence: number;
  evidenceCount: number;
  trend: 'NEW' | 'UP' | 'FLAT' | 'DOWN';
  lastEvaluatedAt: string;
}

export const skillsApi = {
  mine: () => apiRequest<StudentSkill[]>('/me/skills', { auth: true }),
};
