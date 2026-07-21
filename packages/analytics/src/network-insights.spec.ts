import { describe, it, expect } from 'vitest';
import { computeNetworkInsights } from './network-insights';
import type { PrismaClient } from '@fca/database';

/** Fixture Prisma double — each test supplies only the rows it needs. */
function mockPrisma(o: {
  members?: unknown[];
  students?: unknown[];
  batches?: number;
  opportunities?: number;
  alumni?: number;
  questions?: unknown[];
  attendance?: unknown[];
  scores?: unknown[];
  risks?: unknown[];
  applications?: unknown[];
  mentoring?: number;
  answers?: unknown[];
  referrals?: unknown[];
}): PrismaClient {
  return {
    organizationMember: { findMany: async () => o.members ?? [] },
    batchStudent: { findMany: async () => o.students ?? [] },
    batch: { count: async () => o.batches ?? 0 },
    opportunity: { count: async () => o.opportunities ?? 0 },
    alumniProfile: { count: async () => o.alumni ?? 0 },
    communityQuestion: { findMany: async () => o.questions ?? [] },
    attendanceRecord: { findMany: async () => o.attendance ?? [] },
    studentScore: { findMany: async () => o.scores ?? [] },
    studentRiskSnapshot: { findMany: async () => o.risks ?? [] },
    application: { findMany: async () => o.applications ?? [] },
    mentorBooking: { count: async () => o.mentoring ?? 0 },
    communityAnswer: { findMany: async () => o.answers ?? [] },
    referral: { findMany: async () => o.referrals ?? [] },
  } as unknown as PrismaClient;
}

describe('computeNetworkInsights', () => {
  it('returns a zeroed but well-formed picture for an empty organization', async () => {
    const i = await computeNetworkInsights(mockPrisma({}), 'org1');
    expect(i.organizationId).toBe('org1');
    expect(i.learning.activeStudents).toBe(0);
    expect(i.career.placementRate).toBe(0);
    expect(i.community.answeredRate).toBe(0);
    expect(i.highlights).toHaveLength(3);
  });

  it('rolls learning, career and community activity into one picture', async () => {
    const i = await computeNetworkInsights(
      mockPrisma({
        members: [{ userId: 'u1' }, { userId: 'u2' }, { userId: 'm1' }],
        students: [{ userId: 'u1' }, { userId: 'u2' }],
        batches: 2,
        opportunities: 3,
        alumni: 4,
        questions: [
          { id: 'q1', status: 'ANSWERED' },
          { id: 'q2', status: 'OPEN' },
        ],
        attendance: [
          { studentId: 'u1', status: 'PRESENT' },
          { studentId: 'u1', status: 'EXCUSED' }, // excluded from both sides
          { studentId: 'u2', status: 'PRESENT' },
          { studentId: 'u2', status: 'ABSENT' },
        ],
        scores: [{ overallScore: 80 }, { overallScore: 40 }],
        risks: [
          { userId: 'u2', level: 'CRITICAL' },
          { userId: 'u2', level: 'LOW' }, // older, ignored
        ],
        applications: [
          { studentId: 'u1', status: 'HIRED' },
          { studentId: 'u2', status: 'REJECTED' },
        ],
        mentoring: 5,
        answers: [{ authorId: 'm1' }, { authorId: 'm1' }],
        referrals: [{ referrerId: 'u1' }],
      }),
      'org1',
    );

    expect(i.learning).toMatchObject({
      activeStudents: 2,
      activeBatches: 2,
      avgAttendance: 75, // (100 + 50) / 2
      avgOverallScore: 60,
      atRiskCount: 1,
    });
    expect(i.career).toMatchObject({
      openOpportunities: 3,
      applications: 2,
      applicants: 2,
      hires: 1,
      placementRate: 50,
      mentoringSessions: 5,
      alumni: 4,
    });
    expect(i.community).toMatchObject({
      questions: 2,
      answers: 2,
      answeredRate: 50,
      referrals: 1,
      activeContributors: 2, // m1 answered, u1 referred
    });
  });

  it('states highlights that restate the underlying counts', async () => {
    const i = await computeNetworkInsights(
      mockPrisma({
        questions: [{ id: 'q1', status: 'ANSWERED' }],
        applications: [{ studentId: 'u1', status: 'HIRED' }],
        answers: [{ authorId: 'm1' }],
      }),
      'org1',
    );
    const byLabel = Object.fromEntries(i.highlights.map((h) => [h.label, h]));
    expect(byLabel['Community answer rate'].value).toBe('100%');
    expect(byLabel['Placement rate'].value).toBe('100%');
    expect(byLabel['Placement rate'].detail).toContain('1 hire(s) from 1 applicant(s)');
  });
});
