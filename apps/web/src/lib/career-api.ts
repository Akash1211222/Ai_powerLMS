import { apiRequest } from './api-client';
import type { PlacementTier } from './placement-api';

export type ProfileVisibility = 'PRIVATE' | 'PLACEMENT' | 'PUBLIC';
export type ExperienceKind = 'WORK' | 'EDUCATION' | 'CERTIFICATION' | 'VOLUNTEER';

export interface CareerProject {
  id: string;
  title: string;
  description: string | null;
  url: string | null;
  skills: string[];
  order: number;
}

export interface CareerExperience {
  id: string;
  kind: ExperienceKind;
  title: string;
  organization: string;
  location: string | null;
  startDate: string;
  endDate: string | null;
  current: boolean;
  description: string | null;
  order: number;
}

export interface CareerProfile {
  id: string;
  userId: string;
  headline: string | null;
  summary: string | null;
  location: string | null;
  phone: string | null;
  websiteUrl: string | null;
  linkedinUrl: string | null;
  githubUrl: string | null;
  resumeUrl: string | null;
  openToWork: boolean;
  visibility: ProfileVisibility;
  projects: CareerProject[];
  experiences: CareerExperience[];
}

export interface Resume {
  identity: { name: string; email: string; avatarUrl: string | null };
  profile: CareerProfile;
  topSkills: Array<{ name: string; score: number }>;
  readiness: { readinessScore: number; tier: PlacementTier };
}

export interface UpdateProfileInput {
  headline?: string | null;
  summary?: string | null;
  location?: string | null;
  phone?: string | null;
  websiteUrl?: string | null;
  linkedinUrl?: string | null;
  githubUrl?: string | null;
  resumeUrl?: string | null;
  openToWork?: boolean;
  visibility?: ProfileVisibility;
}

export interface ProjectInput {
  title: string;
  description?: string | null;
  url?: string | null;
  skills?: string[];
}

export interface ExperienceInput {
  kind?: ExperienceKind;
  title: string;
  organization: string;
  location?: string | null;
  startDate: string;
  endDate?: string | null;
  current?: boolean;
  description?: string | null;
}

export const careerApi = {
  mine: () => apiRequest<CareerProfile>('/me/career-profile', { auth: true }),
  resume: () => apiRequest<Resume>('/me/career-profile/resume', { auth: true }),
  update: (input: UpdateProfileInput) =>
    apiRequest<CareerProfile>('/me/career-profile', { method: 'PUT', body: input, auth: true }),
  addProject: (input: ProjectInput) =>
    apiRequest<CareerProject>('/me/career-profile/projects', { method: 'POST', body: input, auth: true }),
  deleteProject: (id: string) =>
    apiRequest<{ success: true }>(`/me/career-profile/projects/${id}`, { method: 'DELETE', auth: true }),
  addExperience: (input: ExperienceInput) =>
    apiRequest<CareerExperience>('/me/career-profile/experiences', { method: 'POST', body: input, auth: true }),
  deleteExperience: (id: string) =>
    apiRequest<{ success: true }>(`/me/career-profile/experiences/${id}`, { method: 'DELETE', auth: true }),
};
