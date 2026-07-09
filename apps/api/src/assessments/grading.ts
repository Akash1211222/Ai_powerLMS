export type GradableType =
  | 'MCQ'
  | 'MULTI_SELECT'
  | 'TRUE_FALSE'
  | 'SHORT_ANSWER'
  | 'CODING'
  | 'SQL'
  | 'CASE_STUDY'
  | 'FILE_TASK';

export interface GradableQuestion {
  id: string;
  type: GradableType;
  points: number;
  topic?: string | null;
  correctText?: string | null;
  options: Array<{ id: string; isCorrect: boolean }>;
}

export interface SubmittedAnswer {
  questionId: string;
  selectedOptionIds?: string[];
  textAnswer?: string | null;
}

export interface GradedAnswer {
  questionId: string;
  isCorrect: boolean | null; // null = needs manual/AI review
  pointsAwarded: number;
  needsReview: boolean;
}

export interface TopicResult {
  topic: string;
  correct: number;
  total: number;
  percent: number;
}

export interface GradeResult {
  answers: GradedAnswer[];
  score: number;
  maxScore: number;
  percent: number;
  needsReview: boolean;
  topics: TopicResult[];
}

const AUTO_GRADED = new Set<GradableType>(['MCQ', 'MULTI_SELECT', 'TRUE_FALSE', 'SHORT_ANSWER']);

function setsEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = new Set(a);
  return b.every((x) => sa.has(x));
}

function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Deterministic auto-grading (§16). Objective types are graded exactly; open
 * types (CODING/SQL/CASE_STUDY/FILE_TASK, and SHORT_ANSWER without an answer
 * key) are flagged for review and score 0 until graded. Produces a topic-level
 * breakdown from auto-graded questions — the evidence the skill engine uses.
 */
export function gradeAttempt(
  questions: GradableQuestion[],
  submitted: SubmittedAnswer[],
): GradeResult {
  const byQuestion = new Map(submitted.map((a) => [a.questionId, a]));
  const graded: GradedAnswer[] = [];
  const topicAgg = new Map<string, { correct: number; total: number }>();
  let score = 0;
  let maxScore = 0;
  let anyReview = false;

  for (const q of questions) {
    maxScore += q.points;
    const answer = byQuestion.get(q.id);
    const selected = answer?.selectedOptionIds ?? [];
    const correctIds = q.options.filter((o) => o.isCorrect).map((o) => o.id);

    let isCorrect: boolean | null;
    let needsReview = false;

    if (q.type === 'MCQ' || q.type === 'TRUE_FALSE' || q.type === 'MULTI_SELECT') {
      isCorrect = correctIds.length > 0 && setsEqual(selected, correctIds);
    } else if (q.type === 'SHORT_ANSWER') {
      if (q.correctText && q.correctText.trim()) {
        isCorrect = Boolean(answer?.textAnswer) && normalize(answer!.textAnswer!) === normalize(q.correctText);
      } else {
        isCorrect = null;
        needsReview = true;
      }
    } else {
      // Open-ended — manual/AI review later.
      isCorrect = null;
      needsReview = true;
    }

    if (needsReview) anyReview = true;
    const pointsAwarded = isCorrect === true ? q.points : 0;
    score += pointsAwarded;
    graded.push({ questionId: q.id, isCorrect, pointsAwarded, needsReview });

    // Topic evidence only from auto-graded questions.
    if (AUTO_GRADED.has(q.type) && isCorrect !== null) {
      const topic = (q.topic && q.topic.trim()) || 'General';
      const agg = topicAgg.get(topic) ?? { correct: 0, total: 0 };
      agg.total += 1;
      if (isCorrect) agg.correct += 1;
      topicAgg.set(topic, agg);
    }
  }

  const topics: TopicResult[] = [...topicAgg.entries()].map(([topic, a]) => ({
    topic,
    correct: a.correct,
    total: a.total,
    percent: a.total > 0 ? Math.round((a.correct / a.total) * 100) : 0,
  }));

  return {
    answers: graded,
    score,
    maxScore,
    percent: maxScore > 0 ? Math.round((score / maxScore) * 100) : 0,
    needsReview: anyReview,
    topics,
  };
}
