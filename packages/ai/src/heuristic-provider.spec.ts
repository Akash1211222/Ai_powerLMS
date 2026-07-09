import { describe, it, expect } from 'vitest';
import { HeuristicProvider } from './heuristic-provider';
import { evaluationOutputSchema } from './schema';

const rubric = [
  { id: 'c1', title: 'Correctness of Pandas usage', weight: 40 },
  { id: 'c2', title: 'Code clarity', weight: 20 },
];

describe('HeuristicProvider', () => {
  const provider = new HeuristicProvider();

  it('produces schema-valid, low-confidence (review-bound) output', async () => {
    const out = await provider.evaluateSubmission({
      assignmentTitle: 'A1',
      maxScore: 100,
      rubric,
      submissionText: 'x'.repeat(300) + ' pandas dataframe correctness clarity',
    });
    expect(() => evaluationOutputSchema.parse(out)).not.toThrow();
    expect(out.confidence).toBeLessThan(0.6); // always routed to human review
    expect(out.criteria).toHaveLength(2);
  });

  it('is deterministic for identical input', async () => {
    const input = { assignmentTitle: 'A', maxScore: 100, rubric, submissionText: 'hello world' };
    const a = await provider.evaluateSubmission(input);
    const b = await provider.evaluateSubmission(input);
    expect(a.criteria).toEqual(b.criteria);
  });

  it('never exceeds a criterion weight and scores empty submissions low', async () => {
    const out = await provider.evaluateSubmission({
      assignmentTitle: 'A',
      maxScore: 100,
      rubric,
      submissionText: '',
    });
    expect(out.criteria[0].score).toBeLessThanOrEqual(40);
    expect(out.criteria[1].score).toBeLessThanOrEqual(20);
  });
});
