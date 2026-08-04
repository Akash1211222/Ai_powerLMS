import { z } from 'zod';

/** Deterministic weekly metrics given to the provider (§21). Computed by the
 * platform — the model narrates, it does not invent numbers (§17). */
export interface ProgressReportInput {
  studentName: string;
  periodLabel: string;
  metrics: {
    attendanceRate: number;
    sessionsAttended: number;
    sessionsTotal: number;
    lessonsCompleted: number;
    assignmentsSubmitted: number;
    quizzesTaken: number;
    quizAvg: number | null;
    overallScore: number | null;
    recoveryTasksCompleted: number;
  };
  skillTrends: Array<{ name: string; trend: string; score: number }>;
  weakSkills: Array<{ name: string; score: number }>;
  riskLevel: string | null;
}

/** Validated structured report output (§3, §21, §36). */
export const progressReportOutputSchema = z.object({
  summary: z.string().min(10).max(2000),
  achievements: z.array(z.string().max(300)).max(6).default([]),
  improvements: z.array(z.string().max(300)).max(6).default([]),
  weakAreas: z.array(z.string().max(300)).max(6).default([]),
  nextWeekGoals: z.array(z.string().max(300)).min(1).max(6),
  trainerNote: z.string().max(600),
  mentorNote: z.string().max(600),
});

export type ProgressReportOutput = z.infer<typeof progressReportOutputSchema>;
