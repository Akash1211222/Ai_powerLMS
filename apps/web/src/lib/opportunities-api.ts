import { apiRequest } from './api-client';

export type OpportunityType = 'FULL_TIME' | 'PART_TIME' | 'INTERNSHIP' | 'CONTRACT';
export type WorkMode = 'ONSITE' | 'REMOTE' | 'HYBRID';
export type OpportunityStatus = 'DRAFT' | 'OPEN' | 'CLOSED';

export interface Opportunity {
  id: string;
  organizationId: string;
  title: string;
  companyName: string;
  location: string | null;
  type: OpportunityType;
  workMode: WorkMode;
  description: string;
  requirements: string[];
  minReadiness: number | null;
  openings: number | null;
  salaryMin: number | null;
  salaryMax: number | null;
  currency: string;
  applyUrl: string | null;
  deadline: string | null;
  status: OpportunityStatus;
  publishedAt: string | null;
  createdAt: string;
}

export interface OpportunityMatch {
  eligible: boolean;
  matchScore: number;
  matchedSkills: string[];
  missingSkills: string[];
}

export type DiscoverOpportunity = Opportunity & { match: OpportunityMatch };

export interface CreateOpportunityInput {
  organizationId: string;
  title: string;
  companyName: string;
  location?: string | null;
  type?: OpportunityType;
  workMode?: WorkMode;
  description: string;
  requirements?: string[];
  minReadiness?: number | null;
}

export interface Paginated<T> {
  data: T[];
  meta: { total: number; page: number; pageSize: number; totalPages: number };
}

export const opportunitiesApi = {
  discover: () => apiRequest<DiscoverOpportunity[]>('/me/opportunities', { auth: true }),
  list: (organizationId: string) =>
    apiRequest<Paginated<Opportunity>>(`/opportunities?organizationId=${encodeURIComponent(organizationId)}`, { auth: true }),
  create: (input: CreateOpportunityInput) =>
    apiRequest<Opportunity>('/opportunities', { method: 'POST', body: input, auth: true }),
  publish: (id: string) => apiRequest<Opportunity>(`/opportunities/${id}/publish`, { method: 'POST', auth: true }),
  close: (id: string) => apiRequest<Opportunity>(`/opportunities/${id}/close`, { method: 'POST', auth: true }),
};
