import type { AIProvider } from './provider';
import { evaluationOutputSchema, type EvaluationInput, type EvaluationOutput } from './schema';

const PROMPT_VERSION = 'eval-v1';

/**
 * Real Anthropic-backed evaluator (§3, §36). Calls the Messages API via fetch
 * (no SDK dependency). Requests strict JSON and validates it against the shared
 * schema — important AI output is never parsed with fragile string logic.
 * Only instantiated when an API key is present; otherwise the heuristic runs.
 */
export class AnthropicProvider implements AIProvider {
  readonly name = 'anthropic';
  readonly promptVersion = PROMPT_VERSION;

  constructor(
    private readonly apiKey: string,
    readonly model: string,
    private readonly timeoutMs = 60_000,
  ) {}

  async evaluateSubmission(input: EvaluationInput): Promise<EvaluationOutput> {
    const system =
      'You are an assignment evaluator. Score each rubric criterion from 0 to its weight based ONLY on the submission. ' +
      'Be strict and evidence-based. Respond with ONLY a JSON object matching the given shape — no prose, no markdown fences.';

    const shape = {
      criteria: input.rubric.map((c) => ({ criterionId: c.id, score: `0..${c.weight}`, comment: 'string' })),
      confidence: '0..1',
      summary: 'string',
      strengths: ['string'],
      improvements: ['string'],
    };

    const user = [
      `Assignment: ${input.assignmentTitle}`,
      input.instructions ? `Instructions: ${input.instructions}` : '',
      `Rubric: ${JSON.stringify(input.rubric)}`,
      `Submission text: ${input.submissionText ?? '(none)'}`,
      input.repoUrl ? `Repository: ${input.repoUrl}` : '',
      `Return JSON of exactly this shape: ${JSON.stringify(shape)}`,
    ]
      .filter(Boolean)
      .join('\n\n');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let json: unknown;
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: 1500,
          system,
          messages: [{ role: 'user', content: user }],
        }),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`Anthropic API error ${res.status}: ${await res.text()}`);
      const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
      const text = data.content?.find((b) => b.type === 'text')?.text ?? '';
      json = JSON.parse(extractJson(text));
    } finally {
      clearTimeout(timer);
    }
    // Validation throws on mismatch — the orchestrator falls back to heuristic.
    return evaluationOutputSchema.parse(json);
  }
}

function extractJson(text: string): string {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('No JSON object in AI response');
  return text.slice(start, end + 1);
}
