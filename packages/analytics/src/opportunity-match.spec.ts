import { describe, it, expect } from 'vitest';
import { computeOpportunityMatch } from './opportunity-match';

describe('computeOpportunityMatch', () => {
  it('is eligible + full match when readiness clears the gate and skills line up', () => {
    const m = computeOpportunityMatch({
      requirements: ['SQL', 'Pandas'],
      minReadiness: 60,
      readinessScore: 72,
      strongSkills: [{ name: 'sql', score: 80 }, { name: 'Pandas', score: 70 }],
    });
    expect(m.eligible).toBe(true);
    expect(m.matchScore).toBe(100);
    expect(m.matchedSkills).toEqual(['SQL', 'Pandas']);
    expect(m.missingSkills).toEqual([]);
  });

  it('reports partial matches and missing skills (case-insensitive)', () => {
    const m = computeOpportunityMatch({
      requirements: ['SQL', 'Spark', 'AWS'],
      minReadiness: null,
      readinessScore: 40,
      strongSkills: [{ name: 'sql', score: 65 }],
    });
    expect(m.eligible).toBe(true); // no gate
    expect(m.matchScore).toBe(33); // 1 of 3
    expect(m.matchedSkills).toEqual(['SQL']);
    expect(m.missingSkills).toEqual(['Spark', 'AWS']);
  });

  it('is ineligible when readiness is below the gate', () => {
    const m = computeOpportunityMatch({
      requirements: ['SQL'],
      minReadiness: 70,
      readinessScore: 55,
      strongSkills: [{ name: 'SQL', score: 90 }],
    });
    expect(m.eligible).toBe(false);
    expect(m.matchScore).toBe(100); // skills still match; eligibility is separate
  });

  it('treats a no-requirements posting as a full match', () => {
    const m = computeOpportunityMatch({ requirements: [], minReadiness: null, readinessScore: 10, strongSkills: [] });
    expect(m.matchScore).toBe(100);
    expect(m.eligible).toBe(true);
  });
});
