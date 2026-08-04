export type { AIProvider } from './provider';
export {
  evaluationOutputSchema,
  type EvaluationInput,
  type EvaluationOutput,
} from './schema';
export { HeuristicProvider } from './heuristic-provider';
export { AnthropicProvider } from './anthropic-provider';
export { getProvider } from './factory';
export { runSubmissionEvaluation, type EvaluationResult } from './evaluate';
export {
  scoreJobStudentMatch,
  type MatchInput,
  type MatchResult,
} from './match';
export {
  computeStudentInsight,
  type StudentSignals,
  type StudentInsight,
  type RiskLevel,
} from './insights';
export {
  generateAssignment,
  generateAssignmentHeuristic,
  inferLanguageFromCourse,
  type CodeLanguage,
  type GenerateAssignmentInput,
  type GeneratedAssignment,
} from './generate-assignment';
