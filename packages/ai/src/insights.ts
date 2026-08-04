/**
 * Student intelligence insights (§16, §41). Risk scores are DETERMINISTIC and
 * explainable — computed from real academic signals, never hallucinated. The
 * narrative summary is assembled from the same signals so every statement can
 * be traced back to a number.
 */

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export interface StudentSignals {
  /** Attendance rate 0–100 (excused sessions excluded from denominator). */
  attendanceRate: number;
  /** Number of attendance records counted (0 = no signal). */
  attendanceCount: number;
  /** Average final assignment score percent 0–100. */
  assignmentAvg: number;
  /** Evaluated assignment submissions counted. */
  assignmentCount: number;
  /** Assignments published to the student's batches that have no submission. */
  missingAssignments: number;
  /** Average assessment percent 0–100 (best attempt per assessment). */
  assessmentAvg: number;
  /** Graded assessment attempts counted. */
  assessmentCount: number;
  /** Average course progress percent 0–100. */
  courseProgress: number;
  /** Topic-level performance from assessments. */
  topics: Array<{ topic: string; percent: number }>;
}

export interface StudentInsight {
  riskScore: number; // 0–100, higher = more at risk
  riskLevel: RiskLevel;
  strengths: string[];
  concerns: string[];
  recommendations: string[];
  summary: string;
}

function clamp(n: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

/**
 * Weighted risk model. Each pillar contributes its "shortfall from 100" scaled
 * by a weight; missing work adds a fixed penalty per item. Weights:
 *   attendance 30%, assignments 30%, assessments 25%, progress 15%.
 * Pillars with no data contribute a mild neutral risk (30% shortfall) so a
 * silent student is never marked "safe" by absence of evidence.
 */
export function computeStudentInsight(signals: StudentSignals): StudentInsight {
  const attendanceShortfall = signals.attendanceCount > 0 ? 100 - signals.attendanceRate : 30;
  const assignmentShortfall = signals.assignmentCount > 0 ? 100 - signals.assignmentAvg : 30;
  const assessmentShortfall = signals.assessmentCount > 0 ? 100 - signals.assessmentAvg : 30;
  const progressShortfall = 100 - signals.courseProgress;

  const base =
    attendanceShortfall * 0.3 +
    assignmentShortfall * 0.3 +
    assessmentShortfall * 0.25 +
    progressShortfall * 0.15;
  const missingPenalty = Math.min(20, signals.missingAssignments * 7);
  const riskScore = clamp(base + missingPenalty);
  const riskLevel: RiskLevel = riskScore >= 55 ? 'HIGH' : riskScore >= 30 ? 'MEDIUM' : 'LOW';

  const strengths: string[] = [];
  const concerns: string[] = [];
  const recommendations: string[] = [];

  if (signals.attendanceCount > 0) {
    if (signals.attendanceRate >= 85) strengths.push(`Strong attendance (${signals.attendanceRate}%)`);
    else if (signals.attendanceRate < 70) {
      concerns.push(`Low attendance (${signals.attendanceRate}%)`);
      recommendations.push('Schedule a check-in about attendance blockers');
    }
  } else {
    concerns.push('No attendance data recorded yet');
  }

  if (signals.assignmentCount > 0) {
    if (signals.assignmentAvg >= 80) strengths.push(`High assignment scores (avg ${signals.assignmentAvg}%)`);
    else if (signals.assignmentAvg < 60) {
      concerns.push(`Weak assignment performance (avg ${signals.assignmentAvg}%)`);
      recommendations.push('Review assignment feedback together and set a revision plan');
    }
  }
  if (signals.missingAssignments > 0) {
    concerns.push(
      `${signals.missingAssignments} published assignment${signals.missingAssignments > 1 ? 's' : ''} not submitted`,
    );
    recommendations.push('Follow up on pending assignment submissions');
  }

  if (signals.assessmentCount > 0) {
    if (signals.assessmentAvg >= 80) strengths.push(`Strong assessment results (avg ${signals.assessmentAvg}%)`);
    else if (signals.assessmentAvg < 60) concerns.push(`Low assessment scores (avg ${signals.assessmentAvg}%)`);
  }

  const weakTopics = signals.topics.filter((t) => t.percent < 60);
  const strongTopics = signals.topics.filter((t) => t.percent >= 80);
  if (strongTopics.length) {
    strengths.push(`Confident in: ${strongTopics.map((t) => t.topic).join(', ')}`);
  }
  if (weakTopics.length) {
    concerns.push(`Struggling topics: ${weakTopics.map((t) => `${t.topic} (${t.percent}%)`).join(', ')}`);
    recommendations.push(`Assign targeted practice on ${weakTopics.map((t) => t.topic).join(', ')}`);
  }

  if (signals.courseProgress >= 75) strengths.push(`Good course progress (${signals.courseProgress}%)`);
  else if (signals.courseProgress < 40) {
    concerns.push(`Course progress behind (${signals.courseProgress}%)`);
    recommendations.push('Encourage a steady lesson-completion cadence');
  }

  if (riskLevel === 'HIGH' && recommendations.length === 0) {
    recommendations.push('Escalate to a mentor intervention session');
  }
  if (recommendations.length === 0) {
    recommendations.push('Keep the current cadence — consider stretch goals');
  }

  const summary =
    riskLevel === 'HIGH'
      ? `At risk (score ${riskScore}/100). ${concerns[0] ?? 'Multiple weak signals'}. Intervention recommended.`
      : riskLevel === 'MEDIUM'
        ? `Needs attention (score ${riskScore}/100). ${concerns[0] ?? 'Some weak signals'}.`
        : `On track (score ${riskScore}/100). ${strengths[0] ?? 'Signals look healthy'}.`;

  return { riskScore, riskLevel, strengths, concerns, recommendations, summary };
}
