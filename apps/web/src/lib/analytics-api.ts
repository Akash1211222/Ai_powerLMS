import { apiRequest } from './api-client';

export type HealthBand = 'HEALTHY' | 'WATCH' | 'AT_RISK';
export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface BatchStudentRow {
  userId: string;
  name: string;
  overallScore: number | null;
  attendanceRate: number;
  progress: number;
  skillMastery: number | null;
  riskLevel: RiskLevel | null;
}

export interface WeakSkillRollup {
  skillId: string;
  name: string;
  avgScore: number;
  students: number;
}

export interface BatchHealth {
  batchId: string;
  studentCount: number;
  metrics: {
    avgAttendance: number;
    avgOverallScore: number;
    avgSkillMastery: number;
    avgProgress: number;
    completionRate: number;
  };
  riskDistribution: Record<RiskLevel | 'UNKNOWN', number>;
  atRiskCount: number;
  healthScore: number;
  band: HealthBand;
  topWeakSkills: WeakSkillRollup[];
  students: BatchStudentRow[];
  version: number;
}

export const analyticsApi = {
  batchHealth: (batchId: string) => apiRequest<BatchHealth>(`/batches/${batchId}/health`, { auth: true }),
  myBatchesHealth: () => apiRequest<BatchHealth[]>('/me/batches/health', { auth: true }),
};
