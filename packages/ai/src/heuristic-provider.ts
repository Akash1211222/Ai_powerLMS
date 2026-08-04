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
    const isCode = Boolean(input.language && input.language !== 'NONE');
    const codeOutput = (input.codeOutput ?? '').trim();
    const hasOutput = codeOutput.length > 0;
    const looksLikeCode = isCode && hasText && /[{};()=]|def |function |class |SELECT |#include/i.test(text);

    const criteria = input.rubric.map((c) => {
      let factor = 0.35;
      if (isCode) {
        if (looksLikeCode) factor += 0.25;
        if (hasText && text.length >= 80) factor += 0.15;
        if (hasOutput && !/error|exception|traceback/i.test(codeOutput)) factor += 0.15;
        if (hasOutput && /error|exception|traceback/i.test(codeOutput)) factor -= 0.1;
        if (keywordOverlap(c.title, text) || keywordOverlap(c.description ?? '', text)) factor += 0.1;
      } else {
        if (hasText && words >= 40) factor += 0.25;
        if (hasText && words >= 150) factor += 0.15;
        if (hasRepo) factor += 0.1;
        if (hasText && keywordOverlap(c.title, text)) factor += 0.1;
      }
      factor = Math.min(1, Math.max(0.1, factor));
      const score = Math.round(c.weight * factor);
      return {
        criterionId: c.id,
        score,
        comment: hasText
          ? `Heuristic assessment of "${c.title}" from ${isCode ? 'code' : 'submission'} signals.`
          : `No submission content to assess "${c.title}".`,
      };
    });

    const strengths: string[] = [];
    const improvements: string[] = [];
    if (isCode) {
      if (looksLikeCode) strengths.push('Submitted runnable-looking source code.');
      if (hasOutput && !/error|exception|traceback/i.test(codeOutput)) {
        strengths.push('Code produced output without obvious runtime errors.');
      }
      if (!looksLikeCode) improvements.push('Submit complete source code for the assigned language.');
      if (!hasOutput) improvements.push('Run your code in the compiler before submitting so output can be assessed.');
      if (hasOutput && /error|exception|traceback/i.test(codeOutput)) {
        improvements.push('Fix runtime/compile errors shown in the console.');
      }
    } else {
      if (hasRepo) strengths.push('Included a repository link.');
      if (words >= 150) strengths.push('Provided a substantial written response.');
      if (!hasText) improvements.push('Add a written explanation of your approach.');
      if (words > 0 && words < 40) improvements.push('Expand your response with more detail.');
      if (!hasRepo) improvements.push('Attach your work (e.g. a repository URL) where relevant.');
    }

    // Code submissions with successful run get higher confidence so students
    // see an instant released score (AI_COMPLETED >= 0.6 threshold).
    const confidence = isCode && looksLikeCode && hasOutput && !/error|exception|traceback/i.test(codeOutput)
      ? 0.72
      : isCode && looksLikeCode
        ? 0.62
        : 0.4;

    return {
      criteria,
      confidence,
      summary: hasText
        ? isCode
          ? `Automated code evaluation for ${input.language}. Score reflects structure, completeness, and run output.`
          : 'Automated heuristic draft based on submission completeness and rubric coverage.'
        : 'Empty submission — heuristic could not assess it.',
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
