import type { AIProvider } from './provider';
import { evaluationOutputSchema, type EvaluationInput, type EvaluationOutput } from './schema';
import {
  recoveryPlanOutputSchema,
  type RecoveryPlanInput,
  type RecoveryPlanOutput,
} from './recovery-schema';

const PROMPT_VERSION = 'eval-v1';

/**
 * Real Anthropic-backed provider (§3, §36). Calls the Messages API via fetch
 * (no SDK dependency). Requests strict JSON and validates it against the shared
 * schemas — important AI output is never parsed with fragile string logic.
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

  /** One strict-JSON completion against the Messages API. */
  private async completeJson(system: string, user: string, maxTokens: number): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
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
          max_tokens: maxTokens,
          system,
          messages: [{ role: 'user', content: user }],
        }),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`Anthropic API error ${res.status}: ${await res.text()}`);
      const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
      const text = data.content?.find((b) => b.type === 'text')?.text ?? '';
      return JSON.parse(extractJson(text));
    } finally {
      clearTimeout(timer);
    }
  }

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

    const json = await this.completeJson(system, user, 1500);
    // Validation throws on mismatch — the orchestrator falls back to heuristic.
    return evaluationOutputSchema.parse(json);
  }

  async generateRecoveryPlan(input: RecoveryPlanInput): Promise<RecoveryPlanOutput> {
    const system =
      'You are an academic support planner for a training academy. Given deterministic risk signals and weak skills ' +
      '(computed by the platform — do not invent numbers), produce a concrete, encouraging recovery plan the student can ' +
      'act on. 3-6 specific tasks, each achievable within a week. Respond with ONLY a JSON object matching the given ' +
      'shape — no prose, no markdown fences.';

    const shape = {
      summary: 'string (2-4 sentences addressed to staff + student)',
      tasks: [{ title: 'string', detail: 'string' }],
      mentorActions: ['string'],
      trainerActions: ['string'],
      followUpDays: '3..30 (integer)',
    };

    const user = [
      `Risk level: ${input.riskLevel} (score ${input.riskScore}/100)`,
      `Contributing factors: ${JSON.stringify(input.factors)}`,
      `Weak skills: ${JSON.stringify(input.weakSkills)}`,
      input.courseTitle ? `Course: ${input.courseTitle}` : '',
      `Return JSON of exactly this shape: ${JSON.stringify(shape)}`,
    ]
      .filter(Boolean)
      .join('\n\n');

    const json = await this.completeJson(system, user, 1500);
    return recoveryPlanOutputSchema.parse(json);
  }
}

function extractJson(text: string): string {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('No JSON object in AI response');
  return text.slice(start, end + 1);
}
