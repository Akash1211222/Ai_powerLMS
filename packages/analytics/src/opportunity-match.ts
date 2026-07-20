export interface OpportunityMatchInput {
  requirements: string[];
  minReadiness: number | null;
  readinessScore: number;
  /** The student's strong skills (name + score), score >= a caller threshold. */
  strongSkills: Array<{ name: string; score: number }>;
}

export interface OpportunityMatch {
  eligible: boolean;
  /** 0..100 — share of required skills the student demonstrably has. */
  matchScore: number;
  matchedSkills: string[];
  missingSkills: string[];
}

const norm = (s: string) => s.trim().toLowerCase();

/**
 * Deterministic opportunity fit (§17, §26). Eligibility is the placement-
 * readiness gate; the match score is the share of the posting's required skills
 * the student has demonstrated. No requirements listed → a full match (nothing
 * to fail on). Explainable: returns exactly which skills matched or are missing.
 */
export function computeOpportunityMatch(input: OpportunityMatchInput): OpportunityMatch {
  const eligible = input.minReadiness == null || input.readinessScore >= input.minReadiness;
  const have = new Set(input.strongSkills.map((s) => norm(s.name)));

  const matchedSkills: string[] = [];
  const missingSkills: string[] = [];
  for (const req of input.requirements) {
    if (have.has(norm(req))) matchedSkills.push(req);
    else missingSkills.push(req);
  }

  const matchScore = input.requirements.length
    ? Math.round((matchedSkills.length / input.requirements.length) * 100)
    : 100;

  return { eligible, matchScore, matchedSkills, missingSkills };
}
