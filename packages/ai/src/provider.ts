import type { EvaluationInput, EvaluationOutput } from './schema';

/**
 * Provider abstraction (§3). The application is never coupled to one AI vendor.
 * All methods return validated structured output. Phase 1 uses evaluateSubmission;
 * later phases add generateQuestions / generateProgressReport / etc.
 */
export interface AIProvider {
  readonly name: string;
  readonly model: string;
  evaluateSubmission(input: EvaluationInput): Promise<EvaluationOutput>;
}
