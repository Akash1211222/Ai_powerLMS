import { apiRequest } from './api-client';

export type PlacementTier = 'READY' | 'NEARLY_READY' | 'DEVELOPING' | 'NOT_READY';

export interface PlacementCriterion {
  key: string;
  label: string;
  detail: string;
  met: boolean;
}

export interface PlacementReadiness {
  userId: string;
  readinessScore: number;
  tier: PlacementTier;
  components: {
    skillMastery: number;
    performance: number;
    consistency: number;
    engagement: number;
    completion: number;
  };
  checklist: PlacementCriterion[];
  strengths: string[];
  gaps: string[];
  version: number;
}

export interface BatchPlacementRow {
  userId: string;
  name: string;
  readinessScore: number;
  tier: PlacementTier;
}

export interface BatchPlacement {
  batchId: string;
  studentCount: number;
  avgReadiness: number;
  tierCounts: Record<PlacementTier, number>;
  students: BatchPlacementRow[];
  version: number;
}

export const placementApi = {
  mine: () => apiRequest<PlacementReadiness>('/me/placement', { auth: true }),
  forBatch: (batchId: string) => apiRequest<BatchPlacement>(`/batches/${batchId}/placement`, { auth: true }),
};
