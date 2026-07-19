import { apiRequest } from './api-client';

export interface RecoveryTask {
  id: string;
  title: string;
  detail: string | null;
  order: number;
  completedAt: string | null;
}

export interface RecoveryPlan {
  id: string;
  summary: string;
  weakSkills: string[];
  mentorActions: string[];
  trainerActions: string[];
  provider: string;
  tasks: RecoveryTask[];
}

export interface Intervention {
  id: string;
  status: 'OPEN' | 'PLAN_READY' | 'IN_PROGRESS' | 'RESOLVED' | 'CANCELLED';
  reason: string;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  riskScore: number;
  followUpAt: string | null;
  createdAt: string;
  plan: RecoveryPlan | null;
}

export interface MyInterventions {
  active: Intervention | null;
  history: Array<Pick<Intervention, 'id' | 'status' | 'riskLevel' | 'reason' | 'createdAt'>>;
}

export const interventionsApi = {
  mine: () => apiRequest<MyInterventions>('/me/interventions', { auth: true }),
  completeTask: (taskId: string) =>
    apiRequest<{ taskId: string; allTasksCompleted: boolean; interventionStatus: string; riskLevel: string | null }>(
      `/me/recovery-tasks/${taskId}/complete`,
      { method: 'POST', auth: true },
    ),
};
