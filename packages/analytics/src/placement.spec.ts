import { describe, it, expect } from 'vitest';
import { computePlacementReadiness, computeBatchPlacement } from './placement';
import type { PrismaClient } from '@fca/database';

function mockPrisma(o: {
  score?: unknown;
  enrollments?: unknown[];
  attempts?: unknown[];
  risk?: unknown;
  students?: unknown[];
}): PrismaClient {
  return {
    studentScore: { findUnique: async () => o.score ?? null },
    enrollment: { findMany: async () => o.enrollments ?? [] },
    assessmentAttempt: { findMany: async () => o.attempts ?? [] },
    studentRiskSnapshot: { findFirst: async () => o.risk ?? null },
    batchStudent: { findMany: async () => o.students ?? [] },
  } as unknown as PrismaClient;
}

const strongScore = { skillMasteryScore: 85, performanceScore: 80, consistencyScore: 90, engagementScore: 75 };

describe('computePlacementReadiness', () => {
  it('rates a strong, complete student READY with no gaps', async () => {
    const r = await computePlacementReadiness(
      mockPrisma({
        score: strongScore,
        enrollments: [{ progress: { percent: 100 } }],
        attempts: [
          { percent: 80, assessment: { passingScore: 60 } },
          { percent: 70, assessment: { passingScore: 60 } },
          { percent: 90, assessment: { passingScore: 60 } },
        ],
      }),
      'u1',
    );
    expect(r.tier).toBe('READY');
    expect(r.readinessScore).toBeGreaterThanOrEqual(80);
    expect(r.gaps).toHaveLength(0);
    expect(r.strengths.length).toBe(r.checklist.length);
  });

  it('surfaces explainable gaps and a low tier for a weak student', async () => {
    const r = await computePlacementReadiness(
      mockPrisma({
        score: { skillMasteryScore: 20, performanceScore: 30, consistencyScore: 40, engagementScore: 25 },
        enrollments: [{ progress: { percent: 15 } }],
        attempts: [],
        risk: { level: 'HIGH' },
      }),
      'u1',
    );
    expect(r.tier).toBe('NOT_READY');
    expect(r.gaps.length).toBeGreaterThan(0);
    // The at-risk criterion must fail and be explained.
    const riskItem = r.checklist.find((c) => c.key === 'risk');
    expect(riskItem?.met).toBe(false);
    expect(riskItem?.detail).toContain('HIGH');
    expect(r.gaps.some((g) => g.includes('Course completion'))).toBe(true);
  });

  it('treats a missing score as zeroed components (not a crash)', async () => {
    const r = await computePlacementReadiness(mockPrisma({}), 'u1');
    expect(r.readinessScore).toBe(0);
    expect(r.tier).toBe('NOT_READY');
    expect(r.components.skillMastery).toBe(0);
  });

  it('requires 3 passed assessments — near-misses stay unmet', async () => {
    const r = await computePlacementReadiness(
      mockPrisma({
        score: strongScore,
        enrollments: [{ progress: { percent: 90 } }],
        attempts: [
          { percent: 80, assessment: { passingScore: 60 } },
          { percent: 55, assessment: { passingScore: 60 } }, // failed
        ],
      }),
      'u1',
    );
    expect(r.checklist.find((c) => c.key === 'assessments')?.met).toBe(false);
  });
});

describe('computeBatchPlacement', () => {
  it('rolls per-student readiness into tier counts and a ranked roster', async () => {
    const student = (userId: string, first: string) => ({
      userId,
      user: { email: `${userId}@x.io`, profile: { firstName: first, lastName: 'X' } },
    });
    // Two students; scores differ by userId via distinct mock is hard, so both
    // share the mock — assert structure + ranking invariants instead.
    const b = await computeBatchPlacement(
      mockPrisma({
        students: [student('u1', 'Ann'), student('u2', 'Ben')],
        score: strongScore,
        enrollments: [{ progress: { percent: 100 } }],
        attempts: [
          { percent: 80, assessment: { passingScore: 60 } },
          { percent: 70, assessment: { passingScore: 60 } },
          { percent: 90, assessment: { passingScore: 60 } },
        ],
      }),
      'b1',
    );
    expect(b.studentCount).toBe(2);
    expect(b.students).toHaveLength(2);
    // Sorted descending by readiness.
    expect(b.students[0].readinessScore).toBeGreaterThanOrEqual(b.students[1].readinessScore);
    const totalTiers = Object.values(b.tierCounts).reduce((a, n) => a + n, 0);
    expect(totalTiers).toBe(2);
  });
});
