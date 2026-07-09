import type { PrismaClient } from '@fca/database';
import { SKILL_TAXONOMY, skillSlug, SKILL_CALC_VERSION } from '@fca/shared';
import { aggregateSkill, trendFor, type SkillSource } from './skill';

/**
 * Ensures the reference skill taxonomy exists (idempotent). Called by seeds and
 * on API boot so skill mapping always has something to resolve against (§20).
 */
export async function ensureSkillTaxonomy(prisma: PrismaClient): Promise<void> {
  for (let i = 0; i < SKILL_TAXONOMY.length; i++) {
    const cat = SKILL_TAXONOMY[i]!;
    const slug = skillSlug(cat.name);
    const category = await prisma.skillCategory.upsert({
      where: { slug },
      update: { name: cat.name, order: i },
      create: { name: cat.name, slug, order: i },
    });
    for (const name of cat.skills) {
      const s = skillSlug(name);
      await prisma.skill.upsert({
        where: { slug: s },
        update: { categoryId: category.id, name },
        create: { categoryId: category.id, name, slug: s },
      });
    }
  }
}

/**
 * Recomputes a student's skill profile from topic-level assessment performance
 * (§16 → §20). Deterministic; idempotent; stores the raw evidence so a trainer
 * can see WHY a skill score is what it is (§9). Shared by API, worker and seed.
 */
export async function recomputeStudentSkills(
  prisma: PrismaClient,
  userId: string,
): Promise<{ updated: number }> {
  const skills = await prisma.skill.findMany({ select: { id: true, name: true } });
  const skillIdByName = new Map(skills.map((s) => [s.name.toLowerCase(), s.id]));

  const topicRows = await prisma.topicPerformance.findMany({
    where: { attempt: { studentId: userId, status: 'GRADED' } },
    select: { topic: true, correct: true, total: true, attemptId: true },
  });

  const sourcesBySkill = new Map<string, SkillSource[]>();
  for (const tp of topicRows) {
    const skillId = skillIdByName.get(tp.topic.toLowerCase());
    if (!skillId) continue; // topic not in the taxonomy — ignore
    const arr = sourcesBySkill.get(skillId) ?? [];
    arr.push({
      sourceType: 'ASSESSMENT',
      sourceId: tp.attemptId,
      topic: tp.topic,
      correct: tp.correct,
      total: tp.total,
    });
    sourcesBySkill.set(skillId, arr);
  }

  let updated = 0;
  for (const [skillId, sources] of sourcesBySkill) {
    const agg = aggregateSkill(sources);
    const prev = await prisma.studentSkill.findUnique({
      where: { userId_skillId: { userId, skillId } },
      select: { score: true },
    });
    const trend = trendFor(prev ? prev.score : null, agg.score);

    const studentSkill = await prisma.studentSkill.upsert({
      where: { userId_skillId: { userId, skillId } },
      update: {
        score: agg.score,
        confidence: agg.confidence,
        evidenceCount: agg.evidenceCount,
        trend,
        calcVersion: SKILL_CALC_VERSION,
        lastEvaluatedAt: new Date(),
      },
      create: {
        userId,
        skillId,
        score: agg.score,
        confidence: agg.confidence,
        evidenceCount: agg.evidenceCount,
        trend,
        calcVersion: SKILL_CALC_VERSION,
      },
    });

    await prisma.studentSkillEvidence.deleteMany({ where: { studentSkillId: studentSkill.id } });
    await prisma.studentSkillEvidence.createMany({
      data: sources.map((s) => ({
        studentSkillId: studentSkill.id,
        sourceType: s.sourceType,
        sourceId: s.sourceId,
        topic: s.topic ?? null,
        correct: s.correct,
        total: s.total,
      })),
    });
    updated++;
  }

  return { updated };
}
