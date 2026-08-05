/**
 * Student intelligence insights (§16, §41). Risk scores are DETERMINISTIC and
 * explainable — computed from real academic signals, never hallucinated.
 * Gemini (or another LLM) may only narrate and coach around these numbers.
 */

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';
export type Momentum = 'RISING' | 'STABLE' | 'SLIPPING';
export type PillarStatus = 'strong' | 'ok' | 'weak' | 'critical' | 'unknown';

export interface StudentSignals {
  /** Attendance rate 0–100 (excused sessions excluded from denominator). */
  attendanceRate: number;
  /** Number of attendance records counted (0 = no signal). */
  attendanceCount: number;
  presentCount: number;
  lateCount: number;
  absentCount: number;
  /** Average final assignment score percent 0–100. */
  assignmentAvg: number;
  /** Evaluated assignment submissions counted. */
  assignmentCount: number;
  /** Assignments published to the student's batches that have no submission. */
  missingAssignments: number;
  /** Submitted / (submitted + missing) * 100 when denominator > 0. */
  submissionRate: number;
  /** Average assessment percent 0–100 (best attempt per assessment). */
  assessmentAvg: number;
  /** Graded assessment attempts counted. */
  assessmentCount: number;
  /** Average course progress percent 0–100. */
  courseProgress: number;
  /** Topic-level performance from assessments. */
  topics: Array<{ topic: string; percent: number }>;
}

export interface InsightPillar {
  id: 'attendance' | 'assignments' | 'assessments' | 'progress' | 'engagement';
  label: string;
  /** Health score 0–100 (higher = healthier). */
  score: number;
  weight: number;
  status: PillarStatus;
  note: string;
}

export interface FocusArea {
  area: string;
  severity: 'high' | 'medium' | 'low';
  evidence: string;
  action: string;
}

export interface WeekPlanItem {
  focus: string;
  why: string;
}

export interface StudentInsight {
  riskScore: number; // 0–100, higher = more at risk
  riskLevel: RiskLevel;
  momentum: Momentum;
  /** Composite engagement 0–100 (show-up + submit + progress). */
  engagementScore: number;
  /** How balanced the pillars are (0–100). */
  consistencyScore: number;
  /** 1 = monitor, 5 = intervene now. */
  interventionPriority: number;
  strengths: string[];
  concerns: string[];
  recommendations: string[];
  summary: string;
  studentHeadline: string;
  studentNarrative: string;
  trainerBrief: string;
  celebrationWins: string[];
  studentActions: string[];
  trainerActions: string[];
  focusAreas: FocusArea[];
  weekPlan: WeekPlanItem[];
  pillars: InsightPillar[];
  predictedTrajectory: string;
  provider?: string;
}

function clamp(n: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

function pillarStatus(score: number, known: boolean): PillarStatus {
  if (!known) return 'unknown';
  if (score >= 85) return 'strong';
  if (score >= 70) return 'ok';
  if (score >= 50) return 'weak';
  return 'critical';
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

  const attendanceHealth = signals.attendanceCount > 0 ? signals.attendanceRate : 70;
  const assignmentHealth =
    signals.assignmentCount > 0
      ? clamp(signals.assignmentAvg - signals.missingAssignments * 5)
      : signals.missingAssignments > 0
        ? clamp(40 - signals.missingAssignments * 5)
        : 70;
  const assessmentHealth = signals.assessmentCount > 0 ? signals.assessmentAvg : 70;
  const progressHealth = signals.courseProgress;
  const engagementScore = clamp(
    attendanceHealth * 0.35 +
      (signals.submissionRate || (signals.assignmentCount > 0 ? 80 : 50)) * 0.35 +
      progressHealth * 0.3,
  );

  const healthScores = [attendanceHealth, assignmentHealth, assessmentHealth, progressHealth, engagementScore];
  const mean = healthScores.reduce((a, b) => a + b, 0) / healthScores.length;
  const variance =
    healthScores.reduce((a, b) => a + (b - mean) ** 2, 0) / healthScores.length;
  const consistencyScore = clamp(100 - Math.sqrt(variance));

  let momentum: Momentum = 'STABLE';
  if (riskLevel === 'HIGH' || signals.missingAssignments >= 2 || signals.attendanceRate < 65) {
    momentum = 'SLIPPING';
  } else if (
    riskLevel === 'LOW' &&
    engagementScore >= 75 &&
    signals.courseProgress >= 50 &&
    signals.missingAssignments === 0
  ) {
    momentum = 'RISING';
  }

  const interventionPriority =
    riskLevel === 'HIGH' ? (signals.missingAssignments >= 2 || signals.attendanceRate < 60 ? 5 : 4) : riskLevel === 'MEDIUM' ? 3 : momentum === 'RISING' ? 1 : 2;

  const pillars: InsightPillar[] = [
    {
      id: 'attendance',
      label: 'Attendance',
      score: clamp(attendanceHealth),
      weight: 0.3,
      status: pillarStatus(attendanceHealth, signals.attendanceCount > 0),
      note:
        signals.attendanceCount > 0
          ? `${signals.attendanceRate}% across ${signals.attendanceCount} sessions (${signals.lateCount} late, ${signals.absentCount} absent)`
          : 'No attendance sessions recorded yet',
    },
    {
      id: 'assignments',
      label: 'Assignments',
      score: clamp(assignmentHealth),
      weight: 0.3,
      status: pillarStatus(assignmentHealth, signals.assignmentCount > 0 || signals.missingAssignments > 0),
      note:
        signals.assignmentCount > 0
          ? `Avg ${signals.assignmentAvg}% on ${signals.assignmentCount} evaluated · ${signals.missingAssignments} missing · submit rate ${signals.submissionRate}%`
          : signals.missingAssignments > 0
            ? `${signals.missingAssignments} published assignment(s) still outstanding`
            : 'No evaluated assignments yet',
    },
    {
      id: 'assessments',
      label: 'Assessments',
      score: clamp(assessmentHealth),
      weight: 0.25,
      status: pillarStatus(assessmentHealth, signals.assessmentCount > 0),
      note:
        signals.assessmentCount > 0
          ? `Avg ${signals.assessmentAvg}% across ${signals.assessmentCount} graded assessment(s)`
          : 'No graded assessments yet',
    },
    {
      id: 'progress',
      label: 'Course progress',
      score: clamp(progressHealth),
      weight: 0.15,
      status: pillarStatus(progressHealth, true),
      note: `${signals.courseProgress}% average course completion`,
    },
    {
      id: 'engagement',
      label: 'Engagement',
      score: engagementScore,
      weight: 0,
      status: pillarStatus(engagementScore, true),
      note: `Composite of show-up, submit rate, and progress → ${engagementScore}/100`,
    },
  ];

  const strengths: string[] = [];
  const concerns: string[] = [];
  const recommendations: string[] = [];
  const celebrationWins: string[] = [];
  const focusAreas: FocusArea[] = [];
  const studentActions: string[] = [];
  const trainerActions: string[] = [];
  const weekPlan: WeekPlanItem[] = [];

  if (signals.attendanceCount > 0) {
    if (signals.attendanceRate >= 85) {
      strengths.push(`Strong attendance (${signals.attendanceRate}%)`);
      celebrationWins.push('You keep showing up — that consistency compounds.');
    } else if (signals.attendanceRate < 70) {
      concerns.push(`Low attendance (${signals.attendanceRate}%)`);
      recommendations.push('Schedule a check-in about attendance blockers');
      focusAreas.push({
        area: 'Attendance',
        severity: signals.attendanceRate < 55 ? 'high' : 'medium',
        evidence: `${signals.attendanceRate}% present/late · ${signals.absentCount} absent`,
        action: 'Pick 3 fixed session times this week and protect them on your calendar',
      });
      studentActions.push('Message your trainer before any session you might miss');
      trainerActions.push('Run a 10-minute attendance blocker conversation');
      weekPlan.push({ focus: 'Protect 3 live sessions', why: 'Attendance is dragging the risk score' });
    }
    if (signals.lateCount >= 3) {
      concerns.push(`Frequent lateness (${signals.lateCount} late marks)`);
      studentActions.push('Set a 15-minute pre-class reminder so you join on time');
    }
  } else {
    concerns.push('No attendance data recorded yet');
    trainerActions.push('Confirm the student is rostered on live/batch sessions');
  }

  if (signals.assignmentCount > 0) {
    if (signals.assignmentAvg >= 80) {
      strengths.push(`High assignment scores (avg ${signals.assignmentAvg}%)`);
      celebrationWins.push(`Assignment average of ${signals.assignmentAvg}% — keep shipping.`);
    } else if (signals.assignmentAvg < 60) {
      concerns.push(`Weak assignment performance (avg ${signals.assignmentAvg}%)`);
      recommendations.push('Review assignment feedback together and set a revision plan');
      focusAreas.push({
        area: 'Assignment quality',
        severity: 'high',
        evidence: `Average ${signals.assignmentAvg}% across ${signals.assignmentCount} evaluations`,
        action: 'Re-open the lowest-scoring lab and revise it with the feedback checklist',
      });
      weekPlan.push({ focus: 'Revise one weak lab', why: 'Quality signals are below the bar' });
    }
  }
  if (signals.missingAssignments > 0) {
    concerns.push(
      `${signals.missingAssignments} published assignment${signals.missingAssignments > 1 ? 's' : ''} not submitted`,
    );
    recommendations.push('Follow up on pending assignment submissions');
    focusAreas.push({
      area: 'Submission backlog',
      severity: signals.missingAssignments >= 2 ? 'high' : 'medium',
      evidence: `${signals.missingAssignments} outstanding · submit rate ${signals.submissionRate}%`,
      action: 'Submit the oldest pending assignment within 48 hours',
    });
    studentActions.push('Block 90 minutes today to clear the oldest missing assignment');
    trainerActions.push('Send a direct nudge listing each missing assignment title');
    weekPlan.push({ focus: 'Clear submission backlog', why: 'Missing work inflates risk immediately' });
  }

  if (signals.assessmentCount > 0) {
    if (signals.assessmentAvg >= 80) {
      strengths.push(`Strong assessment results (avg ${signals.assessmentAvg}%)`);
      celebrationWins.push(`Assessments averaging ${signals.assessmentAvg}% — your concepts are sticking.`);
    } else if (signals.assessmentAvg < 60) {
      concerns.push(`Low assessment scores (avg ${signals.assessmentAvg}%)`);
      focusAreas.push({
        area: 'Concept mastery',
        severity: 'high',
        evidence: `Assessment average ${signals.assessmentAvg}%`,
        action: 'Complete one timed practice quiz on the weakest topic',
      });
      weekPlan.push({ focus: 'Practice quiz on weak topic', why: 'Assessment scores need a lift' });
    }
  }

  const weakTopics = signals.topics.filter((t) => t.percent < 60);
  const strongTopics = signals.topics.filter((t) => t.percent >= 80);
  if (strongTopics.length) {
    strengths.push(`Confident in: ${strongTopics.map((t) => t.topic).join(', ')}`);
    celebrationWins.push(`Topic wins: ${strongTopics.map((t) => t.topic).join(', ')}`);
  }
  if (weakTopics.length) {
    concerns.push(`Struggling topics: ${weakTopics.map((t) => `${t.topic} (${t.percent}%)`).join(', ')}`);
    recommendations.push(`Assign targeted practice on ${weakTopics.map((t) => t.topic).join(', ')}`);
    for (const t of weakTopics.slice(0, 3)) {
      focusAreas.push({
        area: t.topic,
        severity: t.percent < 40 ? 'high' : 'medium',
        evidence: `Topic performance ${t.percent}%`,
        action: `Spend one focused hour on ${t.topic} drills in Skills academy`,
      });
    }
    studentActions.push(`Open Skills academy and drill: ${weakTopics.map((t) => t.topic).join(', ')}`);
    const weakest = weakTopics[0]!;
    trainerActions.push(`Assign a micro-lab covering ${weakest.topic}`);
    weekPlan.push({
      focus: `Drill ${weakest.topic}`,
      why: 'Weakest topic from assessment performance',
    });
  }

  if (signals.courseProgress >= 75) {
    strengths.push(`Good course progress (${signals.courseProgress}%)`);
    celebrationWins.push(`Course progress at ${signals.courseProgress}% — finish line is in sight.`);
  } else if (signals.courseProgress < 40) {
    concerns.push(`Course progress behind (${signals.courseProgress}%)`);
    recommendations.push('Encourage a steady lesson-completion cadence');
    focusAreas.push({
      area: 'Lesson cadence',
      severity: 'medium',
      evidence: `Progress ${signals.courseProgress}%`,
      action: 'Complete 2 lessons before the next live class',
    });
    weekPlan.push({ focus: 'Finish 2 lessons', why: 'Progress is lagging the cohort pace' });
  }

  if (engagementScore >= 80) {
    strengths.push(`High engagement signal (${engagementScore}/100)`);
  } else if (engagementScore < 55) {
    concerns.push(`Low engagement signal (${engagementScore}/100)`);
    trainerActions.push('Pair with a peer buddy for the next two sessions');
  }

  if (riskLevel === 'HIGH' && recommendations.length === 0) {
    recommendations.push('Escalate to a mentor intervention session');
  }
  if (recommendations.length === 0) {
    recommendations.push('Keep the current cadence — consider stretch goals');
  }
  if (studentActions.length === 0) {
    studentActions.push('Pick one stretch challenge in Skills academy this week');
  }
  if (trainerActions.length === 0) {
    trainerActions.push('Acknowledge progress publicly and set one stretch goal');
  }
  if (celebrationWins.length === 0 && riskLevel === 'LOW') {
    celebrationWins.push('Signals look healthy — protect the habits that got you here.');
  }
  if (weekPlan.length === 0) {
    weekPlan.push(
      { focus: 'Ship one polished project update', why: 'Keep momentum visible on your career profile' },
      { focus: 'One skills drill session', why: 'Compound practice while risk is low' },
    );
  }
  while (weekPlan.length < 3) {
    weekPlan.push({
      focus: riskLevel === 'HIGH' ? 'Book a mentor check-in' : 'Review feedback on latest work',
      why: 'Close the loop between effort and growth',
    });
  }

  const summary =
    riskLevel === 'HIGH'
      ? `At risk (score ${riskScore}/100). ${concerns[0] ?? 'Multiple weak signals'}. Intervention recommended.`
      : riskLevel === 'MEDIUM'
        ? `Needs attention (score ${riskScore}/100). ${concerns[0] ?? 'Some weak signals'}.`
        : `On track (score ${riskScore}/100). ${strengths[0] ?? 'Signals look healthy'}.`;

  const studentHeadline =
    riskLevel === 'HIGH'
      ? 'Your signals need a reset this week'
      : riskLevel === 'MEDIUM'
        ? 'You are close — tighten a few habits'
        : momentum === 'RISING'
          ? 'You are rising — keep the streak alive'
          : 'You are on a solid trajectory';

  const studentNarrative =
    `${studentHeadline}. Engagement sits at ${engagementScore}/100 with ${momentum.toLowerCase()} momentum. ` +
    (concerns[0] ? `Watch: ${concerns[0]}. ` : '') +
    (studentActions[0] ? `Start here: ${studentActions[0]}.` : '');

  const trainerBrief =
    `${riskLevel} risk (${riskScore}/100), priority ${interventionPriority}/5, ${momentum.toLowerCase()} momentum. ` +
    `Engagement ${engagementScore}/100. ` +
    (trainerActions[0] ? `Coach move: ${trainerActions[0]}.` : '');

  const predictedTrajectory =
    momentum === 'SLIPPING'
      ? 'Without intervention, risk is likely to climb further over the next 2 weeks.'
      : momentum === 'RISING'
        ? 'On current habits, placement readiness and confidence should keep climbing.'
        : riskLevel === 'MEDIUM'
          ? 'Stable but fragile — one cleared backlog could drop risk into the green.'
          : 'Trajectory is healthy if attendance and submissions stay consistent.';

  return {
    riskScore,
    riskLevel,
    momentum,
    engagementScore,
    consistencyScore,
    interventionPriority,
    strengths,
    concerns,
    recommendations,
    summary,
    studentHeadline,
    studentNarrative,
    trainerBrief,
    celebrationWins,
    studentActions,
    trainerActions,
    focusAreas,
    weekPlan: weekPlan.slice(0, 5),
    pillars,
    predictedTrajectory,
  };
}

/** Empty signals factory for batch aggregation. */
export function emptyStudentSignals(): StudentSignals {
  return {
    attendanceRate: 0,
    attendanceCount: 0,
    presentCount: 0,
    lateCount: 0,
    absentCount: 0,
    assignmentAvg: 0,
    assignmentCount: 0,
    missingAssignments: 0,
    submissionRate: 0,
    assessmentAvg: 0,
    assessmentCount: 0,
    courseProgress: 0,
    topics: [],
  };
}
