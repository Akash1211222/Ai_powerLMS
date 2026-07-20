import { describe, it, expect } from 'vitest';
import { computeBatchHealth } from './batch-health';
import type { PrismaClient } from '@fca/database';

/** Fixture Prisma double — each test supplies only the rows it needs. */
function mockPrisma(o: {
  courseId?: string;
  students?: unknown[];
  attendance?: unknown[];
  scores?: unknown[];
  enrollments?: unknown[];
  risk?: unknown[];
  skills?: unknown[];
}): PrismaClient {
  return {
    batch: { findUnique: async () => (o.courseId ? { courseId: o.courseId } : { courseId: 'c1' }) },
    batchStudent: { findMany: async () => o.students ?? [] },
    attendanceRecord: { findMany: async () => o.attendance ?? [] },
    studentScore: { findMany: async () => o.scores ?? [] },
    enrollment: { findMany: async () => o.enrollments ?? [] },
    studentRiskSnapshot: { findMany: async () => o.risk ?? [] },
    studentSkill: { findMany: async () => o.skills ?? [] },
  } as unknown as PrismaClient;
}

const student = (userId: string, firstName: string) => ({
  userId,
  user: { email: `${userId}@x.io`, profile: { firstName, lastName: 'X' } },
});

describe('computeBatchHealth', () => {
  it('returns an empty, WATCH-band picture for a batch with no students', async () => {
    const h = await computeBatchHealth(mockPrisma({ students: [] }), 'b1');
    expect(h.studentCount).toBe(0);
    expect(h.band).toBe('WATCH');
    expect(h.students).toHaveLength(0);
    expect(h.topWeakSkills).toHaveLength(0);
  });

  it('rolls up per-student signals into explainable batch metrics', async () => {
    const h = await computeBatchHealth(
      mockPrisma({
        courseId: 'c1',
        students: [student('u1', 'Ann'), student('u2', 'Ben')],
        attendance: [
          { studentId: 'u1', status: 'PRESENT' },
          { studentId: 'u1', status: 'PRESENT' },
          { studentId: 'u1', status: 'EXCUSED' }, // excluded from denominator
          { studentId: 'u2', status: 'PRESENT' },
          { studentId: 'u2', status: 'ABSENT' },
        ],
        scores: [
          { userId: 'u1', overallScore: 80, skillMasteryScore: 70 },
          { userId: 'u2', overallScore: 40, skillMasteryScore: 30 },
        ],
        enrollments: [
          { userId: 'u1', progress: { percent: 100 } },
          { userId: 'u2', progress: { percent: 20 } },
        ],
        risk: [
          { userId: 'u2', level: 'HIGH' },
          { userId: 'u2', level: 'LOW' }, // older, ignored (desc order → first wins)
        ],
        skills: [
          { skillId: 's1', score: 30, skill: { name: 'SQL' } },
          { skillId: 's1', score: 50, skill: { name: 'SQL' } },
          { skillId: 's2', score: 90, skill: { name: 'Python' } }, // not weak
        ],
      }),
      'b1',
    );

    expect(h.studentCount).toBe(2);
    expect(h.metrics.avgAttendance).toBe(75); // (100 + 50) / 2
    expect(h.metrics.avgOverallScore).toBe(60); // (80 + 40) / 2
    expect(h.metrics.completionRate).toBe(50); // one of two at 100%
    expect(h.riskDistribution.HIGH).toBe(1);
    expect(h.riskDistribution.UNKNOWN).toBe(1); // u1 has no snapshot
    expect(h.atRiskCount).toBe(1);
    // Weakest shared skill surfaces; the strong one does not.
    expect(h.topWeakSkills).toHaveLength(1);
    expect(h.topWeakSkills[0]).toMatchObject({ name: 'SQL', avgScore: 40, students: 2 });
    // Lowest-scoring student sorts first for the trainer's triage table.
    expect(h.students[0].userId).toBe('u2');
    expect(h.band).toBe(['HEALTHY', 'WATCH', 'AT_RISK'][h.healthScore >= 70 ? 0 : h.healthScore >= 45 ? 1 : 2]);
  });

  it('penalizes health when a large share of the batch is at risk', async () => {
    const healthy = await computeBatchHealth(
      mockPrisma({
        students: [student('u1', 'A')],
        scores: [{ userId: 'u1', overallScore: 85, skillMasteryScore: 80 }],
        enrollments: [{ userId: 'u1', progress: { percent: 90 } }],
        attendance: [{ studentId: 'u1', status: 'PRESENT' }],
      }),
      'b1',
    );
    expect(healthy.band).toBe('HEALTHY');

    const atRisk = await computeBatchHealth(
      mockPrisma({
        students: [student('u1', 'A')],
        scores: [{ userId: 'u1', overallScore: 85, skillMasteryScore: 80 }],
        enrollments: [{ userId: 'u1', progress: { percent: 90 } }],
        attendance: [{ studentId: 'u1', status: 'PRESENT' }],
        risk: [{ userId: 'u1', level: 'CRITICAL' }],
      }),
      'b1',
    );
    // Same performance, but the at-risk penalty pulls the score down.
    expect(atRisk.healthScore).toBeLessThan(healthy.healthScore);
  });
});
