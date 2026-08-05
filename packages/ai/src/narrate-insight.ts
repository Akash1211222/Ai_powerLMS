import { z } from 'zod';
import { completeJson, resolveLlmConfig } from './complete-json';
import type { StudentInsight, StudentSignals } from './insights';

const narratedSchema = z.object({
  summary: z.string().min(20).max(1200),
  studentHeadline: z.string().min(8).max(160),
  studentNarrative: z.string().min(40).max(2000),
  trainerBrief: z.string().min(20).max(1200),
  predictedTrajectory: z.string().min(20).max(600),
  strengths: z.array(z.string().max(240)).max(10),
  concerns: z.array(z.string().max(240)).max(10),
  recommendations: z.array(z.string().max(240)).max(10),
  celebrationWins: z.array(z.string().max(240)).max(8),
  studentActions: z.array(z.string().max(240)).max(8),
  trainerActions: z.array(z.string().max(240)).max(8),
  focusAreas: z
    .array(
      z.object({
        area: z.string().max(120),
        severity: z.enum(['high', 'medium', 'low']),
        evidence: z.string().max(240),
        action: z.string().max(240),
      }),
    )
    .max(8),
  weekPlan: z
    .array(
      z.object({
        focus: z.string().max(160),
        why: z.string().max(240),
      }),
    )
    .max(6),
});

export type EnrichedStudentInsight = StudentInsight & { provider: string };

/**
 * Keep deterministic risk / pillar scores; rewrite coaching narrative with LLM.
 * Numbers in pillars, riskScore, riskLevel, engagement, priority stay frozen.
 */
export async function enrichInsightWithLlm(
  signals: StudentSignals,
  base: StudentInsight,
  meta: {
    studentName?: string;
    audience?: 'student' | 'trainer' | 'both';
    batches?: string[];
  } = {},
  env: NodeJS.ProcessEnv = process.env,
): Promise<EnrichedStudentInsight> {
  const cfg = resolveLlmConfig(env);
  if (!cfg) return { ...base, provider: 'heuristic' };

  try {
    const system =
      'You are the flagship academic intelligence coach for FutureCorp Academy, an AI-native LMS. ' +
      'Risk score, risk level, momentum, engagement, consistency, intervention priority, and pillar scores ' +
      'are ALREADY computed from real LMS data — never invent, change, or contradict those numbers. ' +
      'Write vivid, specific, actionable coaching for BOTH the student and the trainer. ' +
      'Reference concrete signal values from the payload. Be encouraging without sugarcoating risk. ' +
      'Avoid generic LMS fluff. Respond with ONLY valid JSON matching the requested shape.';

    const shape = {
      summary: 'string 3-5 sentences for dashboard card',
      studentHeadline: 'short punchy headline for the student',
      studentNarrative: '2-4 paragraphs coaching the student in second person',
      trainerBrief: 'concise coach brief for teachers/mentors',
      predictedTrajectory: '1-2 sentences on likely outcome if habits continue',
      strengths: ['string'],
      concerns: ['string'],
      recommendations: ['string'],
      celebrationWins: ['string'],
      studentActions: ['specific next actions for the student'],
      trainerActions: ['specific coach moves for the trainer'],
      focusAreas: [{ area: 'string', severity: 'high|medium|low', evidence: 'string', action: 'string' }],
      weekPlan: [{ focus: 'string', why: 'string' }],
    };

    const user = [
      `Student: ${meta.studentName ?? 'Learner'}`,
      `Batches: ${(meta.batches ?? []).join(', ') || 'n/a'}`,
      `Audience emphasis: ${meta.audience ?? 'both'}`,
      `LOCKED metrics (do not change): ${JSON.stringify({
        riskScore: base.riskScore,
        riskLevel: base.riskLevel,
        momentum: base.momentum,
        engagementScore: base.engagementScore,
        consistencyScore: base.consistencyScore,
        interventionPriority: base.interventionPriority,
        pillars: base.pillars,
      })}`,
      `Raw signals: ${JSON.stringify(signals)}`,
      `Heuristic draft (improve, keep numbers consistent): ${JSON.stringify({
        summary: base.summary,
        studentHeadline: base.studentHeadline,
        studentNarrative: base.studentNarrative,
        trainerBrief: base.trainerBrief,
        predictedTrajectory: base.predictedTrajectory,
        strengths: base.strengths,
        concerns: base.concerns,
        recommendations: base.recommendations,
        celebrationWins: base.celebrationWins,
        studentActions: base.studentActions,
        trainerActions: base.trainerActions,
        focusAreas: base.focusAreas,
        weekPlan: base.weekPlan,
      })}`,
      `Return JSON of exactly this shape: ${JSON.stringify(shape)}`,
    ].join('\n');

    const json = await completeJson(system, user, 4096, env);
    const narrated = narratedSchema.parse(json);

    return {
      ...base,
      summary: narrated.summary,
      studentHeadline: narrated.studentHeadline,
      studentNarrative: narrated.studentNarrative,
      trainerBrief: narrated.trainerBrief,
      predictedTrajectory: narrated.predictedTrajectory,
      strengths: narrated.strengths.length ? narrated.strengths : base.strengths,
      concerns: narrated.concerns.length ? narrated.concerns : base.concerns,
      recommendations: narrated.recommendations.length
        ? narrated.recommendations
        : base.recommendations,
      celebrationWins: narrated.celebrationWins.length
        ? narrated.celebrationWins
        : base.celebrationWins,
      studentActions: narrated.studentActions.length ? narrated.studentActions : base.studentActions,
      trainerActions: narrated.trainerActions.length ? narrated.trainerActions : base.trainerActions,
      focusAreas: narrated.focusAreas.length ? narrated.focusAreas : base.focusAreas,
      weekPlan: narrated.weekPlan.length ? narrated.weekPlan : base.weekPlan,
      provider: cfg.kind,
    };
  } catch {
    return { ...base, provider: 'heuristic' };
  }
}

const cohortSchema = z.object({
  headline: z.string().min(8).max(200),
  overview: z.string().min(40).max(2000),
  themes: z.array(z.string().max(200)).max(8),
  priorityActions: z.array(z.string().max(240)).max(8),
  watchlist: z
    .array(
      z.object({
        name: z.string().max(120),
        reason: z.string().max(240),
        action: z.string().max(240),
      }),
    )
    .max(8),
  brightSpots: z.array(z.string().max(240)).max(8),
  coachingCadence: z.string().min(20).max(800),
});

export interface CohortBriefingInputRow {
  name: string;
  riskLevel: string;
  riskScore: number;
  momentum: string;
  engagementScore: number;
  interventionPriority: number;
  summary: string;
  topConcern?: string;
}

export interface CohortBriefing {
  headline: string;
  overview: string;
  themes: string[];
  priorityActions: string[];
  watchlist: Array<{ name: string; reason: string; action: string }>;
  brightSpots: string[];
  coachingCadence: string;
  provider: string;
}

/** Gemini cohort briefing for teachers — narrates aggregate risk, never invents counts. */
export async function enrichCohortBriefingWithLlm(
  stats: { total: number; high: number; medium: number; low: number },
  rows: CohortBriefingInputRow[],
  meta: { organizationHint?: string; batchName?: string } = {},
  env: NodeJS.ProcessEnv = process.env,
): Promise<CohortBriefing> {
  const fallback = heuristicCohortBriefing(stats, rows);
  const cfg = resolveLlmConfig(env);
  if (!cfg) return { ...fallback, provider: 'heuristic' };

  try {
    const system =
      'You are the cohort intelligence officer for FutureCorp Academy. ' +
      'Stats and per-student risk scores are LOCKED from the LMS — never invent student counts or scores. ' +
      'Produce a sharp teacher briefing: themes, watchlist, bright spots, and a practical coaching cadence. ' +
      'Respond with ONLY valid JSON.';

    const shape = {
      headline: 'string',
      overview: '2-4 sentences',
      themes: ['string'],
      priorityActions: ['string'],
      watchlist: [{ name: 'string', reason: 'string', action: 'string' }],
      brightSpots: ['string'],
      coachingCadence: 'string describing this week\'s coaching rhythm',
    };

    const user = [
      `Scope: ${meta.batchName ?? 'All batches'} · ${meta.organizationHint ?? 'FutureCorp Academy'}`,
      `LOCKED stats: ${JSON.stringify(stats)}`,
      `Students (sorted by risk, top ${rows.length}): ${JSON.stringify(rows.slice(0, 12))}`,
      `Return JSON of exactly this shape: ${JSON.stringify(shape)}`,
    ].join('\n');

    const json = await completeJson(system, user, 3072, env);
    const narrated = cohortSchema.parse(json);
    return { ...narrated, provider: cfg.kind };
  } catch {
    return { ...fallback, provider: 'heuristic' };
  }
}

function heuristicCohortBriefing(
  stats: { total: number; high: number; medium: number; low: number },
  rows: CohortBriefingInputRow[],
): Omit<CohortBriefing, 'provider'> {
  const watch = rows
    .filter((r) => r.riskLevel === 'HIGH' || r.interventionPriority >= 4)
    .slice(0, 5)
    .map((r) => ({
      name: r.name,
      reason: r.topConcern ?? r.summary,
      action: 'Book a 15-minute intervention this week',
    }));

  const bright = rows
    .filter((r) => r.riskLevel === 'LOW' && r.engagementScore >= 75)
    .slice(0, 3)
    .map((r) => `${r.name} — engagement ${r.engagementScore}, risk ${r.riskScore}`);

  return {
    headline:
      stats.high > 0
        ? `${stats.high} student${stats.high === 1 ? '' : 's'} need urgent coaching`
        : stats.medium > 0
          ? 'Cohort is mostly stable — tighten the middle band'
          : 'Cohort health looks strong',
    overview: `Scanning ${stats.total} active learners: ${stats.high} high risk, ${stats.medium} need attention, ${stats.low} on track. Focus energy on the watchlist before gaps compound.`,
    themes: [
      stats.high > 0 ? 'Intervention density is elevated' : 'Risk concentration is manageable',
      'Attendance + submission backlog remain leading indicators',
      'Celebrate bright spots publicly to set the peer norm',
    ],
    priorityActions: [
      'Clear missing-assignment backlogs for HIGH risk students within 48 hours',
      'Run one targeted topic drill for the weakest shared assessment topic',
      'Publish a short mid-week pulse check in the batch channel',
    ],
    watchlist: watch.length
      ? watch
      : [{ name: '—', reason: 'No urgent watchlist entries', action: 'Maintain weekly review cadence' }],
    brightSpots: bright.length ? bright : ['Recognize consistent attendance publicly this week'],
    coachingCadence:
      'Mon: scan HIGH risk · Wed: backlog chase · Fri: celebrate wins and set next-week stretch goals.',
  };
}
