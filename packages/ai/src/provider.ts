import type { EvaluationInput, EvaluationOutput } from './schema';
import type { RecoveryPlanInput, RecoveryPlanOutput } from './recovery-schema';
import type { ProgressReportInput, ProgressReportOutput } from './report-schema';

/**
 * Provider abstraction (§3). The application is never coupled to one AI vendor.
 * All methods return validated structured output. Later phases add
 * generateQuestions / analyzeInterview / etc.
 */
export interface AIProvider {
  readonly name: string;
  readonly model: string;
  evaluateSubmission(input: EvaluationInput): Promise<EvaluationOutput>;
  generateRecoveryPlan(input: RecoveryPlanInput): Promise<RecoveryPlanOutput>;
  generateProgressReport(input: ProgressReportInput): Promise<ProgressReportOutput>;
}
