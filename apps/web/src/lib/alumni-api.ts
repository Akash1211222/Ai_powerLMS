import { apiRequest } from './api-client';

export interface AlumniProfile {
  id: string;
  userId: string;
  graduationYear: number | null;
  currentCompany: string | null;
  currentRole: string | null;
  industry: string | null;
  location: string | null;
  story: string | null;
  linkedinUrl: string | null;
  isPublished: boolean;
  openToMentoring: boolean;
  openToReferrals: boolean;
}

export interface AlumniDirectoryEntry {
  userId: string;
  name: string;
  avatarUrl: string | null;
  graduationYear: number | null;
  currentCompany: string | null;
  currentRole: string | null;
  industry: string | null;
  location: string | null;
  story: string | null;
  linkedinUrl: string | null;
  openToMentoring: boolean;
  openToReferrals: boolean;
}

export interface AlumniOutcomes {
  totalAlumni: number;
  openToMentoring: number;
  topCompanies: Array<{ company: string; count: number }>;
  topIndustries: Array<{ industry: string; count: number }>;
}

export type UpdateAlumniInput = Partial<
  Pick<
    AlumniProfile,
    | 'graduationYear'
    | 'currentCompany'
    | 'currentRole'
    | 'industry'
    | 'location'
    | 'story'
    | 'linkedinUrl'
    | 'isPublished'
    | 'openToMentoring'
    | 'openToReferrals'
  >
>;

export const alumniApi = {
  mine: () => apiRequest<AlumniProfile>('/me/alumni-profile', { auth: true }),
  update: (input: UpdateAlumniInput) =>
    apiRequest<AlumniProfile>('/me/alumni-profile', { method: 'PUT', body: input, auth: true }),
  directory: () => apiRequest<AlumniDirectoryEntry[]>('/alumni', { auth: true }),
  outcomes: () => apiRequest<AlumniOutcomes>('/alumni/outcomes', { auth: true }),
};
