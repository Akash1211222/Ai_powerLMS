import { apiRequest } from './api-client';

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';
export type Momentum = 'RISING' | 'STABLE' | 'SLIPPING';
export type PillarStatus = 'strong' | 'ok' | 'weak' | 'critical' | 'unknown';

export interface StudentSignals {
  attendanceRate: number;
  attendanceCount: number;
  presentCount: number;
  lateCount: number;
  absentCount: number;
  assignmentAvg: number;
  assignmentCount: number;
  missingAssignments: number;
  submissionRate: number;
  assessmentAvg: number;
  assessmentCount: number;
  courseProgress: number;
  topics: Array<{ topic: string; percent: number }>;
}

export interface InsightPillar {
  id: 'attendance' | 'assignments' | 'assessments' | 'progress' | 'engagement';
  label: string;
  score: number;
  weight: number;
  status: PillarStatus;
  note: string;
}

export interface FocusArea {
  area: string;
  severity: 'high' | 'medium' | 'low';
  evidence: string;
  action: string;
}

export interface WeekPlanItem {
  focus: string;
  why: string;
}

export interface StudentInsight {
  riskScore: number;
  riskLevel: RiskLevel;
  momentum: Momentum;
  engagementScore: number;
  consistencyScore: number;
  interventionPriority: number;
  strengths: string[];
  concerns: string[];
  recommendations: string[];
  summary: string;
  studentHeadline: string;
  studentNarrative: string;
  trainerBrief: string;
  celebrationWins: string[];
  studentActions: string[];
  trainerActions: string[];
  focusAreas: FocusArea[];
  weekPlan: WeekPlanItem[];
  pillars: InsightPillar[];
  predictedTrajectory: string;
  provider?: string;
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

export interface CohortBriefing {
  headline: string;
  overview: string;
  themes: string[];
  priorityActions: string[];
  watchlist: Array<{ name: string; reason: string; action: string }>;
  brightSpots: string[];
  coachingCadence: string;
  provider: string;
}

export interface CohortResponse {
  stats: {
    total: number;
    high: number;
    medium: number;
    low: number;
    avgEngagement: number;
    avgRisk: number;
  };
  briefing: CohortBriefing;
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
