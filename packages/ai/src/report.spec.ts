import { describe, it, expect } from 'vitest';
import { HeuristicProvider } from './heuristic-provider';
import { progressReportOutputSchema, type ProgressReportInput } from './report-schema';

const strong: ProgressReportInput = {
  studentName: 'Sam Learner',
  periodLabel: 'week of Jul 14',
  metrics: {
    attendanceRate: 95,
    sessionsAttended: 4,
    sessionsTotal: 4,
    lessonsCompleted: 3,
    assignmentsSubmitted: 1,
    quizzesTaken: 2,
    quizAvg: 82,
    overallScore: 78,
    recoveryTasksCompleted: 0,
  },
  skillTrends: [{ name: 'Pandas', trend: 'UP', score: 80 }],
  weakSkills: [],
  riskLevel: 'LOW',
};

describe('HeuristicProvider.generateProgressReport', () => {
  const provider = new HeuristicProvider();

  it('produces a schema-valid report highlighting achievements', async () => {
    const r = await provider.generateProgressReport(strong);
    expect(() => progressReportOutputSchema.parse(r)).not.toThrow();
    expect(r.achievements.join(' ')).toContain('attendance');
    expect(r.achievements.some((a) => a.includes('Pandas'))).toBe(true);
    expect(r.summary).toContain('78/100');
    expect(r.nextWeekGoals.length).toBeGreaterThan(0);
  });

  it('surfaces weak areas + goals for a struggling week', async () => {
    const r = await provider.generateProgressReport({
      ...strong,
      metrics: { ...strong.metrics, attendanceRate: 40, quizAvg: 30, overallScore: 35 },
      weakSkills: [{ name: 'SQL', score: 30 }],
      riskLevel: 'HIGH',
    });
    expect(r.weakAreas.join(' ')).toContain('Attendance');
    expect(r.weakAreas.join(' ')).toContain('SQL');
    expect(r.nextWeekGoals.some((g) => g.includes('SQL'))).toBe(true);
    expect(r.trainerNote).toContain('HIGH');
  });

  it('is deterministic and always yields at least one goal', async () => {
    const empty: ProgressReportInput = {
      studentName: 'X',
      periodLabel: 'w',
      metrics: {
        attendanceRate: 0,
        sessionsAttended: 0,
        sessionsTotal: 0,
        lessonsCompleted: 0,
        assignmentsSubmitted: 0,
        quizzesTaken: 0,
        quizAvg: null,
        overallScore: null,
        recoveryTasksCompleted: 0,
      },
      skillTrends: [],
      weakSkills: [],
      riskLevel: null,
    };
    const a = await provider.generateProgressReport(empty);
    const b = await provider.generateProgressReport(empty);
    expect(a).toEqual(b);
    expect(a.nextWeekGoals.length).toBeGreaterThanOrEqual(1);
  });
});
