import { apiRequest } from './api-client';

export interface ReportMetrics {
  attendanceRate: number;
  sessionsAttended: number;
  sessionsTotal: number;
  lessonsCompleted: number;
  assignmentsSubmitted: number;
  quizzesTaken: number;
  quizAvg: number | null;
  overallScore: number | null;
  recoveryTasksCompleted: number;
}

export interface WeeklyReport {
  id: string;
  periodStart: string;
  periodEnd: string;
  summary: string;
  achievements: string[];
  improvements: string[];
  weakAreas: string[];
  nextWeekGoals: string[];
  trainerNote: string | null;
  mentorNote: string | null;
  metrics: ReportMetrics;
  provider: string;
  createdAt: string;
}

export type ReportListItem = Pick<
  WeeklyReport,
  'id' | 'periodStart' | 'periodEnd' | 'summary' | 'provider' | 'createdAt'
>;

export interface GenerateReportResult {
  skipped: boolean;
  reason?: string;
  reportId?: string;
}

export const reportsApi = {
  mine: () => apiRequest<ReportListItem[]>('/me/reports', { auth: true }),
  one: (id: string) => apiRequest<WeeklyReport>(`/me/reports/${id}`, { auth: true }),
  generateMine: () =>
    apiRequest<GenerateReportResult>('/me/reports/generate', { method: 'POST', auth: true }),
};
