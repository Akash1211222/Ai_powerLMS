import { describe, it, expect } from 'vitest';
import { HeuristicProvider } from './heuristic-provider';
import { recoveryPlanOutputSchema, type RecoveryPlanInput } from './recovery-schema';

const input: RecoveryPlanInput = {
  riskLevel: 'CRITICAL',
  riskScore: 84,
  factors: [
    { code: 'ATTENDANCE_LOW', label: 'Low attendance', detail: 'Attendance is 0%' },
    { code: 'OVERDUE_ASSIGNMENTS', label: 'Overdue assignments', detail: '2 overdue' },
    { code: 'INACTIVITY', label: 'Inactive', detail: 'No activity for 25 days' },
  ],
  weakSkills: [
    { name: 'Pandas', score: 20 },
    { name: 'SQL', score: 35 },
  ],
  courseTitle: 'Python for Data Analytics',
};

describe('HeuristicProvider.generateRecoveryPlan', () => {
  const provider = new HeuristicProvider();

  it('produces a schema-valid plan mapped from the risk factors', async () => {
    const plan = await provider.generateRecoveryPlan(input);
    expect(() => recoveryPlanOutputSchema.parse(plan)).not.toThrow();

    const titles = plan.tasks.map((t) => t.title).join(' | ');
    expect(titles).toContain('Attend the next 3 scheduled sessions');
    expect(titles).toContain('Submit your overdue assignments');
    expect(titles).toContain('Review Pandas fundamentals');
    expect(plan.summary).toContain('critical risk');
  });

  it('is deterministic for identical input', async () => {
    const a = await provider.generateRecoveryPlan(input);
    const b = await provider.generateRecoveryPlan(input);
    expect(a).toEqual(b);
  });

  it('tightens the follow-up window as risk rises', async () => {
    const critical = await provider.generateRecoveryPlan(input);
    const high = await provider.generateRecoveryPlan({ ...input, riskLevel: 'HIGH' });
    expect(critical.followUpDays).toBe(7);
    expect(high.followUpDays).toBe(10);
  });

  it('always yields at least two tasks, even with no matching factors', async () => {
    const plan = await provider.generateRecoveryPlan({
      riskLevel: 'HIGH',
      riskScore: 55,
      factors: [],
      weakSkills: [],
    });
    expect(plan.tasks.length).toBeGreaterThanOrEqual(2);
  });
});
