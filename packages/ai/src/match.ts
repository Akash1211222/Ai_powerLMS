/**
 * Deterministic job–student match scoring (heuristic). Mirrors the assignment
 * evaluation philosophy: explainable, never invents opaque scores, works
 * offline without an LLM. Overlap of skills + role preference drives the score.
 */
export interface MatchInput {
  jobTitle: string;
  jobSkills: string[];
  jobLocation?: string | null;
  studentSkills: string[];
  preferredRoles: string[];
  preferredLocations: string[];
  /** Optional topic-performance percents from assessments (0–100). */
  topicScores?: Array<{ topic: string; percent: number }>;
}

export interface MatchResult {
  score: number; // 0–100
  reason: string;
  skillOverlap: string[];
}

function normalize(s: string): string {
  return s.trim().toLowerCase();
}

export function scoreJobStudentMatch(input: MatchInput): MatchResult {
  const jobSkills = input.jobSkills.map(normalize).filter(Boolean);
  const studentSkills = new Set(input.studentSkills.map(normalize).filter(Boolean));
  const preferredRoles = input.preferredRoles.map(normalize);
  const preferredLocations = input.preferredLocations.map(normalize);
  const jobTitle = normalize(input.jobTitle);
  const jobLocation = input.jobLocation ? normalize(input.jobLocation) : null;

  const skillOverlap = jobSkills.filter((s) => studentSkills.has(s));
  const skillScore =
    jobSkills.length === 0
      ? 40 // no skill requirement → neutral baseline
      : Math.round((skillOverlap.length / jobSkills.length) * 60);

  const roleHit = preferredRoles.some(
    (r) => jobTitle.includes(r) || r.includes(jobTitle) || jobTitle.split(/\s+/).some((w) => r.includes(w)),
  );
  const roleScore = roleHit ? 20 : preferredRoles.length === 0 ? 10 : 0;

  const locationHit =
    !jobLocation ||
    preferredLocations.length === 0 ||
    preferredLocations.some((l) => jobLocation.includes(l) || l.includes(jobLocation));
  const locationScore = locationHit ? 10 : 0;

  // Topic performance boost when a topic overlaps a required skill.
  let topicBoost = 0;
  if (input.topicScores?.length && jobSkills.length) {
    const relevant = input.topicScores.filter((t) =>
      jobSkills.some((s) => normalize(t.topic).includes(s) || s.includes(normalize(t.topic))),
    );
    if (relevant.length) {
      const avg = relevant.reduce((a, t) => a + t.percent, 0) / relevant.length;
      topicBoost = Math.round((avg / 100) * 10);
    }
  }

  const score = Math.max(0, Math.min(100, skillScore + roleScore + locationScore + topicBoost));
  const parts: string[] = [];
  if (skillOverlap.length) {
    parts.push(`Skills match: ${skillOverlap.join(', ')}`);
  } else if (jobSkills.length) {
    parts.push('Limited skill overlap with job requirements');
  }
  if (roleHit) parts.push('Preferred role aligns with job title');
  if (jobLocation && locationHit) parts.push(`Location OK (${input.jobLocation})`);
  if (topicBoost > 0) parts.push(`Assessment topics support fit (+${topicBoost})`);
  if (parts.length === 0) parts.push('Baseline match — update your profile skills for better scoring');

  return { score, reason: parts.join('. ') + '.', skillOverlap };
}
