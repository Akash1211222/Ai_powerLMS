/**
 * Reference skill taxonomy (§20). A hierarchical, platform-level vocabulary of
 * skills grouped by category. Skill NAMES match the topic tags used on
 * assessment questions, so topic-level performance maps directly onto skills.
 *
 * Bumping SKILL_CALC_VERSION invalidates stored StudentSkill scores (they carry
 * the version they were computed with) so the next recompute refreshes them.
 */
export const SKILL_CALC_VERSION = 1;

/** Version of the student performance-scoring model (§17). */
export const SCORE_CALC_VERSION = 1;

/** Version of the at-risk rule set (§18). Stored on every risk snapshot. */
export const RISK_RULE_VERSION = 1;

export interface SkillCategoryDef {
  name: string;
  skills: string[];
}

export const SKILL_TAXONOMY: SkillCategoryDef[] = [
  {
    name: 'Data Analytics',
    skills: ['Python', 'NumPy', 'Pandas', 'SQL', 'Joins', 'Window Functions', 'Data Visualization'],
  },
  {
    name: 'Machine Learning',
    skills: ['Regression', 'Classification', 'Model Evaluation'],
  },
  {
    name: 'Web Development',
    skills: ['JavaScript', 'React', 'Node', 'APIs'],
  },
  {
    name: 'Cloud & DevOps',
    skills: ['Linux', 'Docker', 'CI/CD', 'Cloud'],
  },
];

export function skillSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Flat list of every skill name in the taxonomy. */
export const ALL_SKILL_NAMES: string[] = SKILL_TAXONOMY.flatMap((c) => c.skills);
