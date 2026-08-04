import { apiRequest } from './api-client';
import type { Paginated } from '@fca/shared';

export type JobStatus = 'DRAFT' | 'OPEN' | 'CLOSED';
export type ApplicationStatus =
  | 'APPLIED'
  | 'SHORTLISTED'
  | 'INTERVIEW'
  | 'OFFERED'
  | 'PLACED'
  | 'REJECTED'
  | 'WITHDRAWN';

export interface JobPosting {
  id: string;
  organizationId: string;
  companyName: string;
  title: string;
  description: string | null;
  jobType: string;
  location: string | null;
  ctcMinLpa: number | null;
  ctcMaxLpa: number | null;
  skills: string[];
  eligibility: string | null;
  deadline: string | null;
  status: JobStatus;
  publishedAt: string | null;
  _count?: { applications: number };
  myApplication?: { id: string; status: ApplicationStatus; matchScore: number | null; appliedAt: string } | null;
}

export interface JobApplication {
  id: string;
  status: ApplicationStatus;
  matchScore: number | null;
  matchReason: string | null;
  coverLetter: string | null;
  statusNote: string | null;
  appliedAt: string;
  student?: {
    id: string;
    email: string;
    profile: { firstName: string; lastName: string } | null;
    placementProfile: { skills: string[]; status: string } | null;
  };
  jobPosting?: {
    id: string;
    title: string;
    companyName: string;
    jobType: string;
    location: string | null;
    status: JobStatus;
    ctcMinLpa: number | null;
    ctcMaxLpa: number | null;
  };
}

export interface PlacementProfile {
  userId: string;
  resumeUrl: string | null;
  headline: string | null;
  skills: string[];
  preferredRoles: string[];
  preferredLocations: string[];
  expectedCtcLpa: number | null;
  status: string;
  notes: string | null;
}

export const placementsApi = {
  listJobs: (organizationId: string, status?: JobStatus) => {
    const q = new URLSearchParams({ organizationId, pageSize: '100' });
    if (status) q.set('status', status);
    return apiRequest<Paginated<JobPosting>>(`/placements/jobs?${q}`, { auth: true });
  },
  listOpen: (organizationId: string) =>
    apiRequest<JobPosting[]>(
      `/placements/jobs/open?organizationId=${encodeURIComponent(organizationId)}`,
      { auth: true },
    ),
  getJob: (id: string) => apiRequest<JobPosting>(`/placements/jobs/${id}`, { auth: true }),
  createJob: (input: {
    organizationId: string;
    companyName: string;
    title: string;
    description?: string;
    jobType?: string;
    location?: string;
    ctcMinLpa?: number;
    ctcMaxLpa?: number;
    skills?: string[];
    eligibility?: string;
  }) => apiRequest<JobPosting>('/placements/jobs', { method: 'POST', body: input, auth: true }),
  publish: (id: string) =>
    apiRequest<JobPosting>(`/placements/jobs/${id}/publish`, { method: 'POST', auth: true }),
  close: (id: string) =>
    apiRequest<JobPosting>(`/placements/jobs/${id}/close`, { method: 'POST', auth: true }),
  applications: (jobId: string) =>
    apiRequest<JobApplication[]>(`/placements/jobs/${jobId}/applications`, { auth: true }),
  apply: (jobId: string, coverLetter?: string) =>
    apiRequest<JobApplication>(`/placements/jobs/${jobId}/apply`, {
      method: 'POST',
      body: { coverLetter },
      auth: true,
    }),
  updateApplication: (id: string, status: ApplicationStatus, note?: string) =>
    apiRequest<JobApplication>(`/placements/applications/${id}`, {
      method: 'PATCH',
      body: { status, note },
      auth: true,
    }),
  myApplications: () => apiRequest<JobApplication[]>('/me/applications', { auth: true }),
  getProfile: () => apiRequest<PlacementProfile>('/placements/profile', { auth: true }),
  updateProfile: (input: Partial<PlacementProfile>) =>
    apiRequest<PlacementProfile>('/placements/profile', {
      method: 'PATCH',
      body: input,
      auth: true,
    }),
};
