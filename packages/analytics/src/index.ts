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
