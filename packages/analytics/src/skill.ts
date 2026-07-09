/**
 * Pure skill-mastery calculators (§17, §20). No I/O — fully unit-testable.
 * A student's numeric skill score is derived here from evidence; AI never
 * invents it.
 */
export interface SkillSource {
  sourceType: string; // e.g. "ASSESSMENT"
  sourceId: string;
  topic?: string | null;
  correct: number;
  total: number;
}

export interface SkillAggregate {
  score: number; // 0..100
  confidence: number; // 0..1 — grows with the amount of evidence
  evidenceCount: number;
}

/** Evidence needed for full confidence in a skill score. */
const CONFIDENCE_SATURATION = 12;

export function aggregateSkill(sources: SkillSource[]): SkillAggregate {
  let correct = 0;
  let total = 0;
  for (const s of sources) {
    correct += s.correct;
    total += s.total;
  }
  const score = total > 0 ? Math.round((correct / total) * 100) : 0;
  const confidence = Math.min(1, total / CONFIDENCE_SATURATION);
  return { score, confidence, evidenceCount: sources.length };
}

export type SkillTrend = 'NEW' | 'UP' | 'FLAT' | 'DOWN';

/** Trend relative to a previously stored score (±5 points is the dead-band). */
export function trendFor(previous: number | null, next: number): SkillTrend {
  if (previous === null) return 'NEW';
  if (next - previous >= 5) return 'UP';
  if (previous - next >= 5) return 'DOWN';
  return 'FLAT';
}
