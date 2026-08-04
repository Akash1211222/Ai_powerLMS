import { apiRequest } from './api-client';

export interface StudentSignals {
  attendanceRate: number;
  attendanceCount: number;
  assignmentAvg: number;
  assignmentCount: number;
  missingAssignments: number;
  assessmentAvg: number;
  assessmentCount: number;
  courseProgress: number;
  topics: Array<{ topic: string; percent: number }>;
}

export interface StudentInsight {
  riskScore: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  strengths: string[];
  concerns: string[];
  recommendations: string[];
  summary: string;
}

export interface CohortRow {
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  batches: Array<{ id: string; name: string }>;
  signals: StudentSignals;
  insight: StudentInsight;
}

export interface CohortResponse {
  stats: { total: number; high: number; medium: number; low: number };
  students: CohortRow[];
}

export interface StudentReport {
  student: { id: string; firstName: string; lastName: string; email: string };
  batches: Array<{ id: string; name: string }>;
  signals: StudentSignals;
  insight: StudentInsight;
  recentAssignments: Array<{
    assignmentId: string;
    title: string;
    maxScore: number;
    score: number | null;
    evaluationStatus: string | null;
    at: string | null;
  }>;
  recentAttempts: Array<{
    assessmentId: string;
    title: string;
    percent: number | null;
    at: string | null;
  }>;
}

export const intelligenceApi = {
  me: () => apiRequest<StudentReport>('/intelligence/me', { auth: true }),
  cohort: (organizationId: string, batchId?: string) =>
    apiRequest<CohortResponse>(
      `/intelligence/students?organizationId=${encodeURIComponent(organizationId)}${
        batchId ? `&batchId=${encodeURIComponent(batchId)}` : ''
      }`,
      { auth: true },
    ),
  student: (organizationId: string, studentUserId: string) =>
    apiRequest<StudentReport>(
      `/intelligence/students/${studentUserId}?organizationId=${encodeURIComponent(organizationId)}`,
      { auth: true },
    ),
};
