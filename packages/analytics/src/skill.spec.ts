import { describe, it, expect } from 'vitest';
import { aggregateSkill, trendFor } from './skill';

describe('aggregateSkill', () => {
  it('scores by total correct / total questions', () => {
    const agg = aggregateSkill([
      { sourceType: 'ASSESSMENT', sourceId: 'a', correct: 3, total: 4 },
      { sourceType: 'ASSESSMENT', sourceId: 'b', correct: 1, total: 4 },
    ]);
    expect(agg.score).toBe(50); // 4/8
    expect(agg.evidenceCount).toBe(2);
  });

  it('grows confidence with more evidence, capped at 1', () => {
    expect(aggregateSkill([{ sourceType: 'A', sourceId: '1', correct: 3, total: 6 }]).confidence).toBe(0.5);
    expect(aggregateSkill([{ sourceType: 'A', sourceId: '1', correct: 12, total: 20 }]).confidence).toBe(1);
  });

  it('is 0/0 for no evidence', () => {
    expect(aggregateSkill([])).toEqual({ score: 0, confidence: 0, evidenceCount: 0 });
  });
});

describe('trendFor', () => {
  it('is NEW without a previous score', () => {
    expect(trendFor(null, 70)).toBe('NEW');
  });
  it('detects UP / DOWN beyond the dead-band and FLAT within it', () => {
    expect(trendFor(60, 70)).toBe('UP');
    expect(trendFor(70, 60)).toBe('DOWN');
    expect(trendFor(70, 72)).toBe('FLAT');
  });
});
