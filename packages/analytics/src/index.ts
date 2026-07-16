export {
  aggregateSkill,
  trendFor,
  type SkillSource,
  type SkillAggregate,
  type SkillTrend,
} from './skill';
export { ensureSkillTaxonomy, recomputeStudentSkills } from './skill-recompute';
export { computeScores, type ScoreInputs, type StudentScores } from './score';
export { computeAndStoreStudentScore, type StudentScoreResult } from './score-recompute';
export {
  computeRisk,
  isMeaningfulChange,
  type RiskInputs,
  type RiskResult,
  type RiskFactor,
  type RiskLevelName,
} from './risk';
export { evaluateStudentRisk, type RiskEvaluation } from './risk-evaluate';
