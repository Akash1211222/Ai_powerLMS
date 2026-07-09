import type { AIProvider } from './provider';
import type { EvaluationInput, EvaluationOutput } from './schema';

/**
 * Deterministic, rule-based evaluator. This is NOT a fake LLM — it is a real,
 * explainable heuristic scorer used when no AI provider is configured (dev/CI)
 * or as a deterministic fallback. Its output is always labeled provider
 * "heuristic" and, because confidence is low, always routed to human review.
 */
export class HeuristicProvider implements AIProvider {
  readonly name = 'heuristic';
  readonly model = 'rubric-v1';

  async evaluateSubmission(input: EvaluationInput): Promise<EvaluationOutput> {
    const text = (input.submissionText ?? '').trim();
    const hasText = text.length > 0;
    const words = text ? text.split(/\s+/).length : 0;
    const hasRepo = Boolean(input.repoUrl);

    const criteria = input.rubric.map((c) => {
      let factor = 0.4; // neutral baseline for a genuine attempt
      if (hasText && words >= 40) factor += 0.25;
      if (hasText && words >= 150) factor += 0.15;
      if (hasRepo) factor += 0.1;
      // Reward addressing the criterion topic (keyword overlap).
      if (hasText && keywordOverlap(c.title, text)) factor += 0.1;
      factor = Math.min(1, factor);
      const score = Math.round(c.weight * factor);
      return {
        criterionId: c.id,
        score,
        comment: hasText
          ? `Heuristic assessment of "${c.title}" from submission signals.`
          : `No submission content to assess "${c.title}".`,
      };
    });

    const strengths: string[] = [];
    const improvements: string[] = [];
    if (hasRepo) strengths.push('Included a repository link.');
    if (words >= 150) strengths.push('Provided a substantial written response.');
    if (!hasText) improvements.push('Add a written explanation of your approach.');
    if (words > 0 && words < 40) improvements.push('Expand your response with more detail.');
    if (!hasRepo) improvements.push('Attach your work (e.g. a repository URL) where relevant.');

    return {
      criteria,
      confidence: 0.4,
      summary: hasText
        ? 'Automated heuristic draft based on submission completeness and rubric coverage. Requires trainer review.'
        : 'Empty submission — heuristic could not assess it. Requires trainer review.',
      strengths,
      improvements,
    };
  }
}

function keywordOverlap(title: string, text: string): boolean {
  const lower = text.toLowerCase();
  return title
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 4)
    .some((w) => lower.includes(w));
}
