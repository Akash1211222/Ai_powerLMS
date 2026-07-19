/** Shared queue + job names so the API (producer) and worker (consumer) agree. */
export const AI_EVALUATION_QUEUE = 'ai-evaluation';
export const EVALUATE_SUBMISSION_JOB = 'evaluate-submission';

export const INTELLIGENCE_QUEUE = 'intelligence';
export const GENERATE_RECOVERY_PLAN_JOB = 'generate-recovery-plan';

export interface EvaluateSubmissionJobData {
  submissionId: string;
}

export interface GenerateRecoveryPlanJobData {
  interventionId: string;
}
