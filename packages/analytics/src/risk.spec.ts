import { describe, it, expect } from 'vitest';
import { computeRisk, isMeaningfulChange, type RiskInputs } from './risk';

const healthy: RiskInputs = {
  attendanceRate: 95,
  consecutiveAbsences: 0,
  overdueAssignments: 0,
  assessmentAvg: 85,
  assessmentTrendDelta: 2,
  daysSinceLastActivity: 1,
  skillMastery: 80,
};

describe('computeRisk', () => {
  it('flags a healthy student as LOW with no factors', () => {
    const r = computeRisk(healthy);
    expect(r.level).toBe('LOW');
    expect(r.score).toBe(0);
    expect(r.factors).toHaveLength(0);
  });

  it('explains every triggered factor with evidence + contribution', () => {
    const r = computeRisk({ ...healthy, attendanceRate: 50 });
    const f = r.factors.find((x) => x.code === 'ATTENDANCE_LOW');
    expect(f).toBeTruthy();
    expect(f!.detail).toContain('50%');
    expect(f!.contribution).toBeGreaterThan(0);
    expect(r.recommendedActions.length).toBeGreaterThan(0);
  });

  it('escalates to HIGH when many signals stack up, ranked by impact', () => {
    const r = computeRisk({
      attendanceRate: 40,
      consecutiveAbsences: 4,
      overdueAssignments: 3,
      assessmentAvg: 30,
      assessmentTrendDelta: -25,
      daysSinceLastActivity: 21,
      skillMastery: 30,
    });
    expect(r.score).toBeGreaterThanOrEqual(50);
    expect(r.level).toBe('HIGH');
    expect(r.factors).toHaveLength(7); // every rule fired
    // Most impactful factor first, so recommended actions are prioritized.
    expect(r.factors[0]!.contribution).toBeGreaterThanOrEqual(r.factors[1]!.contribution);
  });

  it('ignores signals that have no data yet', () => {
    const r = computeRisk({
      ...healthy,
      assessmentAvg: null,
      skillMastery: null,
      daysSinceLastActivity: null,
    });
    expect(r.factors).toHaveLength(0);
  });

  it('caps the score at 100', () => {
    const r = computeRisk({
      attendanceRate: 0,
      consecutiveAbsences: 10,
      overdueAssignments: 10,
      assessmentAvg: 0,
      assessmentTrendDelta: -60,
      daysSinceLastActivity: 60,
      skillMastery: 0,
    });
    expect(r.score).toBe(100);
  });
});

describe('isMeaningfulChange', () => {
  it('is true on first detection unless LOW', () => {
    expect(isMeaningfulChange(null, { level: 'HIGH', score: 60 })).toBe(true);
    expect(isMeaningfulChange(null, { level: 'LOW', score: 5 })).toBe(false);
  });
  it('is true when the level changes', () => {
    expect(isMeaningfulChange({ level: 'MEDIUM', score: 30 }, { level: 'HIGH', score: 55 })).toBe(true);
  });
  it('suppresses noise within the same level', () => {
    expect(isMeaningfulChange({ level: 'MEDIUM', score: 30 }, { level: 'MEDIUM', score: 33 })).toBe(false);
    expect(isMeaningfulChange({ level: 'MEDIUM', score: 30 }, { level: 'MEDIUM', score: 42 })).toBe(true);
  });
});
