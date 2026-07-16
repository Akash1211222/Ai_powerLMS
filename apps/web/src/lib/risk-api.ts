import { apiRequest } from './api-client';

export interface RiskFactor {
  code: string;
  label: string;
  detail: string;
  value: number;
  severity: number;
  weight: number;
  contribution: number;
}

export interface AtRiskStudent {
  userId: string;
  name: string;
  batchName: string | null;
  level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  score: number;
  factors: RiskFactor[];
  recommendedActions: string[];
  detectedAt: string;
}

export const riskApi = {
  mine: () => apiRequest<AtRiskStudent[]>('/me/at-risk', { auth: true }),
};
