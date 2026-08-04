import { describe, it, expect } from 'vitest';
import { computeScores, type ScoreInputs } from './score';

const base: ScoreInputs = {
  assessmentPercents: [],
  assignmentPercents: [],
  avgCourseProgress: 0,
  submissionRate: 0,
  attendanceRate: 0,
  skillScores: [],
};

describe('computeScores', () => {
  it('is all-zero for a student with no signals', () => {
    const s = computeScores(base);
    expect(s.overallScore).toBe(0);
    expect(s.performanceScore).toBe(0);
  });

  it('averages assessments and assignments for performance', () => {
    const s = computeScores({ ...base, assessmentPercents: [80, 60], assignmentPercents: [90] });
    // assessmentAvg=70, assignmentAvg=90 -> performance = mean(70,90)=80
    expect(s.performanceScore).toBe(80);
  });

  it('maps attendance directly to consistency', () => {
    expect(computeScores({ ...base, attendanceRate: 92 }).consistencyScore).toBe(92);
  });

  it('blends progress and submission rate for engagement', () => {
    const s = computeScores({ ...base, avgCourseProgress: 50, submissionRate: 1 });
    // 0.6*50 + 0.4*100 = 70
    expect(s.engagementScore).toBe(70);
  });

  it('confidence-weights skill mastery', () => {
    const s = computeScores({
      ...base,
      skillScores: [
        { score: 100, confidence: 1 },
        { score: 0, confidence: 0 }, // ignored (no confidence)
      ],
    });
    expect(s.skillMasteryScore).toBe(100);
  });

  it('combines components into a weighted overall score', () => {
    const s = computeScores({
      assessmentPercents: [100],
      assignmentPercents: [100],
      avgCourseProgress: 100,
      submissionRate: 1,
      attendanceRate: 100,
      skillScores: [{ score: 100, confidence: 1 }],
    });
    expect(s.overallScore).toBe(100);
    expect(s.components).toHaveProperty('weights');
  });
});
