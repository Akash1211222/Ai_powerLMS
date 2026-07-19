import type { AIProvider } from './provider';
import type { EvaluationInput, EvaluationOutput } from './schema';
import type { RecoveryPlanInput, RecoveryPlanOutput } from './recovery-schema';
import type { ProgressReportInput, ProgressReportOutput } from './report-schema';

/**
 * Deterministic, rule-based evaluator. This is NOT a fake LLM — it is a real,
 * explainable heuristic used when no AI provider is configured (dev/CI) or as a
 * deterministic fallback. Its output is always labeled provider "heuristic".
 */
export class HeuristicProvider implements AIProvider {
  readonly name = 'heuristic';
  readonly model = 'rubric-v1';

  async evaluateSubmission(input: EvaluationInput): Promise<EvaluationOutput> {
    const text = (input.submissionText ?? '').trim();
    const hasText = text.length > 0;
    const words = text ? text.split(/\s+/).length : 0;
    const hasRepo = Boolean(input.repoUrl);

    const criteria = input.rubric.map((c) => {
      let factor = 0.4; // neutral baseline for a genuine attempt
      if (hasText && words >= 40) factor += 0.25;
      if (hasText && words >= 150) factor += 0.15;
      if (hasRepo) factor += 0.1;
      // Reward addressing the criterion topic (keyword overlap).
      if (hasText && keywordOverlap(c.title, text)) factor += 0.1;
      factor = Math.min(1, factor);
      const score = Math.round(c.weight * factor);
      return {
        criterionId: c.id,
        score,
        comment: hasText
          ? `Heuristic assessment of "${c.title}" from submission signals.`
          : `No submission content to assess "${c.title}".`,
      };
    });

    const strengths: string[] = [];
    const improvements: string[] = [];
    if (hasRepo) strengths.push('Included a repository link.');
    if (words >= 150) strengths.push('Provided a substantial written response.');
    if (!hasText) improvements.push('Add a written explanation of your approach.');
    if (words > 0 && words < 40) improvements.push('Expand your response with more detail.');
    if (!hasRepo) improvements.push('Attach your work (e.g. a repository URL) where relevant.');

    return {
      criteria,
      confidence: 0.4,
      summary: hasText
        ? 'Automated heuristic draft based on submission completeness and rubric coverage. Requires trainer review.'
        : 'Empty submission — heuristic could not assess it. Requires trainer review.',
      strengths,
      improvements,
    };
  }

  /**
   * Deterministic recovery plan built directly from the risk factors and weak
   * skills (§19). Rule-mapped, explainable, and stable for identical input.
   */
  async generateRecoveryPlan(input: RecoveryPlanInput): Promise<RecoveryPlanOutput> {
    const codes = new Set(input.factors.map((f) => f.code).filter(Boolean));
    const tasks: Array<{ title: string; detail: string }> = [];
    const mentorActions: string[] = [];
    const trainerActions: string[] = [];

    if (codes.has('ATTENDANCE_LOW') || codes.has('CONSECUTIVE_ABSENCE')) {
      tasks.push({
        title: 'Attend the next 3 scheduled sessions',
        detail: 'Rebuilding a regular attendance rhythm is the fastest way to get back on track.',
      });
      trainerActions.push('Check in after each of the next three sessions to confirm attendance');
    }
    if (codes.has('OVERDUE_ASSIGNMENTS')) {
      tasks.push({
        title: 'Submit your overdue assignments',
        detail: 'Start with the oldest one. Partial submissions are better than none.',
      });
      trainerActions.push('Review late submissions promptly and consider an extension if warranted');
    }
    for (const skill of input.weakSkills.slice(0, 3)) {
      tasks.push({
        title: `Review ${skill.name} fundamentals`,
        detail: `Current mastery is ${skill.score}%. Revisit the course lessons on ${skill.name}, then retry the related quiz.`,
      });
    }
    if (codes.has('INACTIVITY')) {
      tasks.push({
        title: 'Complete one lesson this week',
        detail: 'A small, consistent step restarts momentum after a period of inactivity.',
      });
    }
    if (tasks.length < 2) {
      tasks.push({
        title: 'Meet your trainer for a 1:1 check-in',
        detail: 'Agree together on the two most useful next steps.',
      });
      tasks.push({
        title: 'Set a weekly study schedule',
        detail: 'Block two fixed study slots for the coming week.',
      });
    }

    const factorLabels = input.factors.map((f) => f.label.toLowerCase()).join(', ');
    mentorActions.push(
      `Schedule a 1:1 covering: ${factorLabels || 'recent engagement and confidence'}`,
    );
    if (input.weakSkills.length > 0) {
      mentorActions.push(
        `Discuss a practice approach for ${input.weakSkills
          .slice(0, 2)
          .map((s) => s.name)
          .join(' and ')}`,
      );
    }
    trainerActions.push('Review progress against this plan at the follow-up date');

    const followUpDays = input.riskLevel === 'CRITICAL' ? 7 : input.riskLevel === 'HIGH' ? 10 : 14;
    const skillNames = input.weakSkills.map((s) => s.name).join(', ');

    return {
      summary:
        `Support plan responding to ${input.riskLevel.toLowerCase()} risk (score ${input.riskScore}/100). ` +
        `Signals: ${factorLabels || 'multiple indicators'}.` +
        (skillNames ? ` Focus skills: ${skillNames}.` : '') +
        ` Complete the tasks below before the follow-up in ${followUpDays} days.`,
      tasks: tasks.slice(0, 8),
      mentorActions: mentorActions.slice(0, 5),
      trainerActions: trainerActions.slice(0, 5),
      followUpDays,
    };
  }

  /**
   * Deterministic weekly report narrated from the computed metrics (§21).
   * Encouraging but honest; stable for identical input.
   */
  async generateProgressReport(input: ProgressReportInput): Promise<ProgressReportOutput> {
    const m = input.metrics;
    const achievements: string[] = [];
    const improvements: string[] = [];
    const weakAreas: string[] = [];
    const nextWeekGoals: string[] = [];

    if (m.sessionsTotal > 0 && m.attendanceRate >= 80) {
      achievements.push(`Kept attendance strong at ${m.attendanceRate}%.`);
    }
    if (m.lessonsCompleted > 0) achievements.push(`Completed ${m.lessonsCompleted} lesson(s).`);
    if (m.assignmentsSubmitted > 0) achievements.push(`Submitted ${m.assignmentsSubmitted} assignment(s).`);
    if (m.quizzesTaken > 0 && m.quizAvg !== null && m.quizAvg >= 70) {
      achievements.push(`Averaged ${m.quizAvg}% across ${m.quizzesTaken} quiz(zes).`);
    }
    if (m.recoveryTasksCompleted > 0) {
      achievements.push(`Completed ${m.recoveryTasksCompleted} recovery task(s) — great follow-through.`);
    }
    for (const t of input.skillTrends.filter((s) => s.trend === 'UP')) {
      achievements.push(`${t.name} is trending up (now ${t.score}%).`);
    }

    if (m.sessionsTotal > 0 && m.attendanceRate < 75) {
      improvements.push(`Attendance was ${m.attendanceRate}% — aim for at least 80% next week.`);
      weakAreas.push('Attendance');
    }
    if (m.quizzesTaken > 0 && m.quizAvg !== null && m.quizAvg < 60) {
      improvements.push(`Quiz average was ${m.quizAvg}% — revisit the weakest topics.`);
    }
    if (m.lessonsCompleted === 0 && m.assignmentsSubmitted === 0) {
      improvements.push('No lessons or assignments completed this week — restart with one small step.');
    }
    for (const s of input.weakSkills.slice(0, 3)) {
      weakAreas.push(`${s.name} (${s.score}%)`);
      nextWeekGoals.push(`Practice ${s.name} and retake the related quiz.`);
    }
    for (const t of input.skillTrends.filter((s) => s.trend === 'DOWN')) {
      weakAreas.push(`${t.name} slipped to ${t.score}%`);
    }

    if (m.attendanceRate < 80 && m.sessionsTotal > 0) nextWeekGoals.push('Attend every scheduled session.');
    if (nextWeekGoals.length === 0) nextWeekGoals.push('Keep the momentum — complete the next module.');

    const headline =
      m.overallScore !== null
        ? `Overall score is ${m.overallScore}/100.`
        : 'Not enough graded work yet to compute an overall score.';

    return {
      summary:
        `Weekly summary for ${input.studentName} (${input.periodLabel}). ${headline} ` +
        `Attended ${m.sessionsAttended}/${m.sessionsTotal} session(s), completed ${m.lessonsCompleted} lesson(s), ` +
        `submitted ${m.assignmentsSubmitted} assignment(s) and took ${m.quizzesTaken} quiz(zes).` +
        (input.riskLevel && input.riskLevel !== 'LOW' ? ` Current risk level: ${input.riskLevel}.` : ''),
      achievements: achievements.slice(0, 6),
      improvements: improvements.slice(0, 6),
      weakAreas: weakAreas.slice(0, 6),
      nextWeekGoals: nextWeekGoals.slice(0, 6),
      trainerNote:
        input.riskLevel && input.riskLevel !== 'LOW'
          ? `Monitor this student — risk is ${input.riskLevel}. Prioritize the weak areas above.`
          : 'On track. Encourage continued consistency.',
      mentorNote:
        input.weakSkills.length > 0
          ? `Discuss study strategies for ${input.weakSkills
              .slice(0, 2)
              .map((s) => s.name)
              .join(' and ')} at the next session.`
          : 'Check in on goals and motivation for the coming week.',
    };
  }
}

function keywordOverlap(title: string, text: string): boolean {
  const lower = text.toLowerCase();
  return title
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 4)
    .some((w) => lower.includes(w));
}
