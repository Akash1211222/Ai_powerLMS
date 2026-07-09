import type { PrismaClient } from '@fca/database';
import type { AIProvider } from './provider';
import { HeuristicProvider } from './heuristic-provider';
import { getProvider } from './factory';
import type { EvaluationInput } from './schema';

const CONFIDENCE_REVIEW_THRESHOLD = 0.6;

export interface EvaluationResult {
  skipped: boolean;
  reason?: string;
  evaluationId?: string;
  finalScore?: number;
  status?: string;
}

/**
 * Orchestrates one submission's evaluation (§15, §17, §36). Deterministic numeric
 * score is computed HERE from rubric criteria — the provider supplies bounded
 * per-criterion scores + qualitative text, not an invented overall. Idempotent;
 * never overwrites a trainer decision. Shared by the API (manual trigger) and
 * the worker (async job) so the logic lives in exactly one place.
 */
export async function runSubmissionEvaluation(
  prisma: PrismaClient,
  submissionId: string,
  provider: AIProvider = getProvider(),
): Promise<EvaluationResult> {
  const submission = await prisma.assignmentSubmission.findUnique({
    where: { id: submissionId },
    include: { assignment: { include: { criteria: true } }, evaluation: true },
  });
  if (!submission) return { skipped: true, reason: 'submission_not_found' };

  const existing = submission.evaluation;
  if (existing && (existing.status === 'RELEASED' || existing.trainerScore != null)) {
    // Human decision exists — AI must never overwrite it (§15).
    return { skipped: true, reason: 'trainer_reviewed', evaluationId: existing.id };
  }
  const criteria = submission.assignment.criteria;
  if (criteria.length === 0) return { skipped: true, reason: 'no_rubric' };

  const input: EvaluationInput = {
    assignmentTitle: submission.assignment.title,
    instructions: submission.assignment.instructions,
    maxScore: submission.assignment.maxScore,
    rubric: criteria.map((c) => ({ id: c.id, title: c.title, description: c.description, weight: c.weight })),
    submissionText: submission.contentText,
    repoUrl: submission.repoUrl,
  };

  // Run the provider with a deterministic heuristic fallback on any failure.
  const started = Date.now();
  let used: AIProvider = provider;
  let output;
  try {
    output = await provider.evaluateSubmission(input);
  } catch {
    used = new HeuristicProvider();
    output = await used.evaluateSubmission(input);
  }
  const latencyMs = Date.now() - started;

  // Deterministic scoring from bounded per-criterion scores (§17).
  const weightById = new Map(criteria.map((c) => [c.id, c.weight]));
  let rawSum = 0;
  const totalWeight = criteria.reduce((a, c) => a + c.weight, 0);
  const criterionScores = output.criteria
    .filter((cs) => weightById.has(cs.criterionId))
    .map((cs) => {
      const weight = weightById.get(cs.criterionId)!;
      const score = Math.max(0, Math.min(weight, Math.round(cs.score)));
      rawSum += score;
      return { criterionId: cs.criterionId, score, comment: cs.comment ?? '' };
    });
  const overall =
    totalWeight > 0 ? Math.round((rawSum / totalWeight) * submission.assignment.maxScore) : 0;
  const status = output.confidence >= CONFIDENCE_REVIEW_THRESHOLD ? 'AI_COMPLETED' : 'NEEDS_REVIEW';

  const evaluation = await prisma.$transaction(async (tx) => {
    const evalRow = await tx.assignmentEvaluation.upsert({
      where: { submissionId },
      update: {
        aiScore: overall,
        finalScore: overall,
        confidence: output.confidence,
        reason: output.summary,
        evaluatedByAi: true,
        status,
        version: { increment: 1 },
      },
      create: {
        submissionId,
        aiScore: overall,
        finalScore: overall,
        confidence: output.confidence,
        reason: output.summary,
        evaluatedByAi: true,
        status,
      },
    });

    await tx.evaluationCriterionScore.deleteMany({ where: { evaluationId: evalRow.id } });
    if (criterionScores.length) {
      await tx.evaluationCriterionScore.createMany({
        data: criterionScores.map((cs) => ({ evaluationId: evalRow.id, ...cs })),
      });
    }
    await tx.assignmentSubmission.update({
      where: { id: submissionId },
      data: { status: 'EVALUATED' },
    });
    await tx.aIJob.create({
      data: {
        type: 'ASSIGNMENT_EVALUATION',
        status: 'COMPLETED',
        provider: used.name,
        model: used.model,
        inputRef: submissionId,
        output: { overall, confidence: output.confidence, strengths: output.strengths, improvements: output.improvements },
        latencyMs,
      },
    });
    return evalRow;
  });

  return { skipped: false, evaluationId: evaluation.id, finalScore: overall, status };
}
