/**
 * Deterministic at-risk detection (§18). Pure + unit-tested. Every triggered
 * rule becomes an explainable factor carrying its evidence, severity, weight and
 * contribution — the platform never shows an unexplained risk label (§9).
 */
export interface RiskInputs {
  attendanceRate: number; // 0..100
  consecutiveAbsences: number;
  overdueAssignments: number;
  assessmentAvg: number | null; // null = no graded quizzes yet
  assessmentTrendDelta: number; // recent avg - previous avg (negative = declining)
  daysSinceLastActivity: number | null; // null = never active
  skillMastery: number | null; // 0..100
}

export type RiskLevelName = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface RiskFactor {
  code: string;
  label: string;
  detail: string;
  value: number;
  severity: number; // 0..1
  weight: number;
  contribution: number; // weight * severity, rounded
}

export interface RiskResult {
  score: number; // 0..100
  level: RiskLevelName;
  factors: RiskFactor[];
  recommendedActions: string[];
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

// Recommended action per rule — deterministic, actionable (§18).
const ACTIONS: Record<string, string> = {
  ATTENDANCE_LOW: 'Contact the student about attendance and agree a catch-up plan',
  CONSECUTIVE_ABSENCE: 'Reach out today — the student has missed consecutive sessions',
  OVERDUE_ASSIGNMENTS: 'Follow up on overdue assignments and offer an extension if warranted',
  LOW_PERFORMANCE: 'Schedule a review session on the weakest topics',
  PERFORMANCE_DECLINE: 'Investigate the recent drop in assessment scores',
  INACTIVITY: 'Re-engage the student — no learning activity recorded recently',
  LOW_SKILL_MASTERY: 'Assign targeted practice on low-mastery skills',
};

export function computeRisk(input: RiskInputs): RiskResult {
  const factors: RiskFactor[] = [];

  const add = (code: string, label: string, detail: string, value: number, severity: number, weight: number) => {
    const s = clamp01(severity);
    if (s <= 0) return;
    factors.push({
      code,
      label,
      detail,
      value,
      severity: Math.round(s * 100) / 100,
      weight,
      contribution: Math.round(weight * s),
    });
  };

  // 1. Attendance below the 75% threshold.
  if (input.attendanceRate < 75) {
    add(
      'ATTENDANCE_LOW',
      'Low attendance',
      `Attendance is ${input.attendanceRate}% (below the 75% threshold)`,
      input.attendanceRate,
      (75 - input.attendanceRate) / 75,
      25,
    );
  }

  // 2. Three or more consecutive absences.
  if (input.consecutiveAbsences >= 3) {
    add(
      'CONSECUTIVE_ABSENCE',
      'Consecutive absences',
      `Missed ${input.consecutiveAbsences} sessions in a row`,
      input.consecutiveAbsences,
      (input.consecutiveAbsences - 2) / 3,
      20,
    );
  }

  // 3. Overdue assignments.
  if (input.overdueAssignments >= 1) {
    add(
      'OVERDUE_ASSIGNMENTS',
      'Overdue assignments',
      `${input.overdueAssignments} assignment(s) past the deadline with no submission`,
      input.overdueAssignments,
      input.overdueAssignments / 3,
      15,
    );
  }

  // 4. Weak assessment performance.
  if (input.assessmentAvg !== null && input.assessmentAvg < 50) {
    add(
      'LOW_PERFORMANCE',
      'Low assessment scores',
      `Average quiz score is ${input.assessmentAvg}%`,
      input.assessmentAvg,
      (50 - input.assessmentAvg) / 50,
      20,
    );
  }

  // 5. Declining assessment trend.
  if (input.assessmentTrendDelta <= -15) {
    add(
      'PERFORMANCE_DECLINE',
      'Declining scores',
      `Assessment average dropped by ${Math.abs(Math.round(input.assessmentTrendDelta))} points`,
      Math.round(input.assessmentTrendDelta),
      Math.abs(input.assessmentTrendDelta) / 30,
      10,
    );
  }

  // 6. Course inactivity.
  if (input.daysSinceLastActivity !== null && input.daysSinceLastActivity >= 14) {
    add(
      'INACTIVITY',
      'Inactive',
      `No learning activity for ${input.daysSinceLastActivity} days`,
      input.daysSinceLastActivity,
      (input.daysSinceLastActivity - 7) / 21,
      10,
    );
  }

  // 7. Low skill mastery.
  if (input.skillMastery !== null && input.skillMastery < 50) {
    add(
      'LOW_SKILL_MASTERY',
      'Low skill mastery',
      `Skill mastery is ${input.skillMastery}%`,
      input.skillMastery,
      (50 - input.skillMastery) / 50,
      10,
    );
  }

  const score = Math.min(100, factors.reduce((a, f) => a + f.contribution, 0));
  const level: RiskLevelName =
    score >= 75 ? 'CRITICAL' : score >= 50 ? 'HIGH' : score >= 25 ? 'MEDIUM' : 'LOW';

  // Most impactful factors first, so the recommended actions are prioritized.
  factors.sort((a, b) => b.contribution - a.contribution);
  const recommendedActions = factors.map((f) => ACTIONS[f.code]).filter((a): a is string => Boolean(a));

  return { score, level, factors, recommendedActions };
}

/** Whether a new snapshot is worth writing/alerting on (§18: no spam). */
export function isMeaningfulChange(
  previous: { level: RiskLevelName; score: number } | null,
  next: { level: RiskLevelName; score: number },
): boolean {
  if (!previous) return next.level !== 'LOW';
  if (previous.level !== next.level) return true;
  return Math.abs(next.score - previous.score) >= 10;
}
