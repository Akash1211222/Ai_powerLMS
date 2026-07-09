/** Shared queue + job names so the API (producer) and worker (consumer) agree. */
export const AI_EVALUATION_QUEUE = 'ai-evaluation';
export const EVALUATE_SUBMISSION_JOB = 'evaluate-submission';

export interface EvaluateSubmissionJobData {
  submissionId: string;
}
