import { apiRequest } from './api-client';

export type ApplicationStatus =
  | 'APPLIED'
  | 'UNDER_REVIEW'
  | 'SHORTLISTED'
  | 'INTERVIEW'
  | 'OFFERED'
  | 'HIRED'
  | 'REJECTED'
  | 'WITHDRAWN';

export type ReviewStatus = Exclude<ApplicationStatus, 'APPLIED' | 'WITHDRAWN'>;

export interface Application {
  id: string;
  opportunityId: string;
  studentId: string;
  status: ApplicationStatus;
  coverNote: string | null;
  readinessSnapshot: number | null;
  matchSnapshot: number | null;
  decisionNote: string | null;
  reviewedAt: string | null;
  createdAt: string;
  opportunity: {
    id: string;
    title: string;
    companyName: string;
    status: string;
    workMode: string;
    type: string;
  };
}

export interface ApplicantRow {
  id: string;
  status: ApplicationStatus;
  coverNote: string | null;
  readinessSnapshot: number | null;
  matchSnapshot: number | null;
  createdAt: string;
  student: { id: string; email: string; profile: { firstName: string; lastName: string } | null };
}

export const applicationsApi = {
  apply: (opportunityId: string, coverNote?: string) =>
    apiRequest<Application>(`/me/opportunities/${opportunityId}/apply`, {
      method: 'POST',
      body: coverNote ? { coverNote } : {},
      auth: true,
    }),
  mine: () => apiRequest<Application[]>('/me/applications', { auth: true }),
  withdraw: (id: string) => apiRequest<Application>(`/me/applications/${id}/withdraw`, { method: 'POST', auth: true }),
  forOpportunity: (opportunityId: string) =>
    apiRequest<ApplicantRow[]>(`/opportunities/${opportunityId}/applications`, { auth: true }),
  setStatus: (id: string, status: ReviewStatus, decisionNote?: string) =>
    apiRequest<Application>(`/applications/${id}/status`, {
      method: 'PATCH',
      body: decisionNote ? { status, decisionNote } : { status },
      auth: true,
    }),
};
