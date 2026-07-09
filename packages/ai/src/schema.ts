import { z } from 'zod';

/** Input given to a provider to evaluate one submission against a rubric. */
export interface EvaluationInput {
  assignmentTitle: string;
  instructions?: string | null;
  maxScore: number;
  rubric: Array<{ id: string; title: string; description?: string | null; weight: number }>;
  submissionText?: string | null;
  repoUrl?: string | null;
}

/**
 * Structured provider output (§3: validated schema, no fragile string parsing).
 * Per-criterion scores are bounded; the numeric overall/final score is computed
 * deterministically by the orchestrator, NOT invented by the model (§17).
 */
export const evaluationOutputSchema = z.object({
  criteria: z
    .array(
      z.object({
        criterionId: z.string(),
        score: z.number().min(0),
        comment: z.string().max(1000).optional().default(''),
      }),
    )
    .min(1),
  confidence: z.number().min(0).max(1),
  summary: z.string().max(2000),
  strengths: z.array(z.string().max(300)).max(10).default([]),
  improvements: z.array(z.string().max(300)).max(10).default([]),
});

export type EvaluationOutput = z.infer<typeof evaluationOutputSchema>;
