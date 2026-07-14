/**
 * Deterministic student performance scoring (§17). Pure and unit-tested — all
 * numbers are computed here from real signals, never invented by AI. The
 * component breakdown is returned so every score is explainable (§9).
 */
export interface ScoreInputs {
  assessmentPercents: number[]; // graded quiz percents (0..100)
  assignmentPercents: number[]; // released assignment scores as % (0..100)
  avgCourseProgress: number; // 0..100
  submissionRate: number; // 0..1 (submitted / assigned)
  attendanceRate: number; // 0..100
  skillScores: Array<{ score: number; confidence: number }>;
}

export interface StudentScores {
  performanceScore: number;
  engagementScore: number;
  consistencyScore: number;
  skillMasteryScore: number;
  overallScore: number;
  components: Record<string, unknown>;
}

// Overall weighting — sums to 1.0. Tunable; stored with each computation.
const WEIGHTS = { performance: 0.35, consistency: 0.25, engagement: 0.2, skillMastery: 0.2 };

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export function computeScores(input: ScoreInputs): StudentScores {
  const assessmentAvg = avg(input.assessmentPercents);
  const assignmentAvg = avg(input.assignmentPercents);

  // Performance: mean of whichever graded work exists.
  const perfParts = [
    ...(input.assessmentPercents.length ? [assessmentAvg] : []),
    ...(input.assignmentPercents.length ? [assignmentAvg] : []),
  ];
  const performanceScore = clamp(avg(perfParts));

  const consistencyScore = clamp(input.attendanceRate);
  const engagementScore = clamp(0.6 * input.avgCourseProgress + 0.4 * input.submissionRate * 100);

  // Skill mastery: confidence-weighted average of skill scores.
  const confSum = input.skillScores.reduce((a, s) => a + s.confidence, 0);
  const skillMasteryScore = clamp(
    confSum > 0
      ? input.skillScores.reduce((a, s) => a + s.score * s.confidence, 0) / confSum
      : 0,
  );

  const overallScore = clamp(
    WEIGHTS.performance * performanceScore +
      WEIGHTS.consistency * consistencyScore +
      WEIGHTS.engagement * engagementScore +
      WEIGHTS.skillMastery * skillMasteryScore,
  );

  return {
    performanceScore,
    engagementScore,
    consistencyScore,
    skillMasteryScore,
    overallScore,
    components: {
      inputs: {
        assessmentAvg: clamp(assessmentAvg),
        assignmentAvg: clamp(assignmentAvg),
        avgCourseProgress: clamp(input.avgCourseProgress),
        submissionRate: Math.round(input.submissionRate * 100) / 100,
        attendanceRate: clamp(input.attendanceRate),
        skillCount: input.skillScores.length,
      },
      weights: WEIGHTS,
    },
  };
}
