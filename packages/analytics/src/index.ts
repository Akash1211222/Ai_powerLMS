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
export { ensureInterventionForRisk, type EnsureInterventionResult } from './intervention';
export {
  computeRecommendations,
  RECOMMENDATION_VERSION,
  type Recommendation,
  type RecommendationType,
} from './recommend';
export {
  computeBatchHealth,
  BATCH_HEALTH_VERSION,
  type BatchHealth,
  type BatchStudentRow,
  type WeakSkillRollup,
  type HealthBand,
} from './batch-health';
export {
  computePlacementReadiness,
  computeBatchPlacement,
  PLACEMENT_READINESS_VERSION,
  type PlacementReadiness,
  type PlacementComponents,
  type PlacementCriterion,
  type PlacementTier,
  type BatchPlacement,
  type BatchPlacementRow,
} from './placement';
export {
  computeOpportunityMatch,
  type OpportunityMatchInput,
  type OpportunityMatch,
} from './opportunity-match';
export {
  computeContributionScore,
  earnedBadges,
  BADGES,
  BADGE_BY_CODE,
  CONTRIBUTION_VERSION,
  type ContributionCounts,
  type ContributionBreakdown,
  type Contribution,
  type BadgeDefinition,
} from './contribution';
