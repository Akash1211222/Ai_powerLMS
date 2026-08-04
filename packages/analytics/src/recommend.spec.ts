import { describe, it, expect } from 'vitest';
import { computeRecommendations, type Recommendation } from './recommend';
import type { PrismaClient } from '@fca/database';

/**
 * Fixture Prisma double. Each test overrides only the queries it cares about;
 * everything else returns empty. Lets us assert the deterministic ranking
 * without a database.
 */
function mockPrisma(overrides: Record<string, unknown>): PrismaClient {
  const empty = { findMany: async () => [], findFirst: async () => null, count: async () => 0 };
  const model = (o?: Record<string, unknown>) => ({ ...empty, ...(o ?? {}) });
  return {
    batchStudent: model(overrides.batchStudent as object),
    enrollment: model(overrides.enrollment as object),
    studentSkill: model(overrides.studentSkill as object),
    assessmentAttempt: model(overrides.assessmentAttempt as object),
    studentRiskSnapshot: model(overrides.studentRiskSnapshot as object),
    assignment: model(overrides.assignment as object),
    lesson: model(overrides.lesson as object),
  } as unknown as PrismaClient;
}

const types = (recs: Recommendation[]) => recs.map((r) => r.type);

describe('computeRecommendations', () => {
  it('returns a KEEP_GOING nudge when there is nothing pressing', async () => {
    const recs = await computeRecommendations(mockPrisma({}), 'u1');
    expect(recs).toHaveLength(1);
    expect(recs[0].type).toBe('KEEP_GOING');
    expect(recs[0].deepLink).toBe('/courses');
  });

  it('ranks overdue assignments above quizzes, skills and lessons', async () => {
    const recs = await computeRecommendations(
      mockPrisma({
        batchStudent: { findMany: async () => [{ batchId: 'b1' }] },
        enrollment: {
          findMany: async () => [
            { courseId: 'c1', batchId: 'b1', course: { title: 'Data' }, progress: { percent: 30 } },
          ],
        },
        assignment: {
          findMany: async () => [
            { id: 'a1', title: 'ETL Lab', dueAt: new Date('2026-07-14'), batchId: 'b1' },
          ],
        },
        assessmentAttempt: {
          findMany: async () => [
            {
              percent: 40,
              attemptNumber: 1,
              assessment: { id: 'q1', title: 'SQL Quiz', status: 'PUBLISHED', passingScore: 60, maxAttempts: 3, batchId: 'b1' },
            },
          ],
        },
        studentSkill: {
          findMany: async () => [{ skillId: 's1', score: 30, skill: { name: 'SQL' } }],
        },
        lesson: {
          findMany: async () => [
            { id: 'l1', title: 'Joins', progress: [{ status: 'IN_PROGRESS' }] },
          ],
        },
      }),
      'u1',
    );

    // Overdue assignment must lead; every rec carries an explainable reason.
    expect(recs[0].type).toBe('SUBMIT_ASSIGNMENT');
    expect(recs[0].deepLink).toBe('/courses/c1');
    expect(recs.every((r) => r.reason.length > 0)).toBe(true);
    // Priorities are sorted descending.
    for (let i = 1; i < recs.length; i++) expect(recs[i - 1].priority).toBeGreaterThanOrEqual(recs[i].priority);
    expect(types(recs)).toEqual(expect.arrayContaining(['RETAKE_QUIZ', 'REVIEW_SKILL', 'COMPLETE_LESSON']));
  });

  it('only recommends retaking a failed quiz when attempts remain', async () => {
    const base = (maxAttempts: number, used: number, best: number) =>
      mockPrisma({
        assessmentAttempt: {
          findMany: async () => [
            {
              percent: best,
              attemptNumber: used,
              assessment: { id: 'q1', title: 'Quiz', status: 'PUBLISHED', passingScore: 60, maxAttempts, batchId: 'b1' },
            },
          ],
        },
      });

    const canRetake = await computeRecommendations(base(3, 1, 40), 'u1');
    expect(types(canRetake)).toContain('RETAKE_QUIZ');

    const exhausted = await computeRecommendations(base(1, 1, 40), 'u1');
    expect(types(exhausted)).not.toContain('RETAKE_QUIZ');

    const passed = await computeRecommendations(base(3, 1, 75), 'u1');
    expect(types(passed)).not.toContain('RETAKE_QUIZ');
  });

  it('surfaces a mentor booking when risk is elevated', async () => {
    const recs = await computeRecommendations(
      mockPrisma({ studentRiskSnapshot: { findFirst: async () => ({ level: 'CRITICAL' }) } }),
      'u1',
    );
    const mentor = recs.find((r) => r.type === 'BOOK_MENTOR');
    expect(mentor).toBeTruthy();
    expect(mentor!.priority).toBeGreaterThanOrEqual(85);
  });
});
