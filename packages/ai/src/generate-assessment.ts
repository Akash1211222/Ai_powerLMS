import { z } from 'zod';
import { completeJson, resolveLlmConfig } from './complete-json';

export interface GenerateAssessmentInput {
  courseTitle: string;
  courseLevel?: string | null;
  batchName?: string | null;
  topicHint?: string | null;
  questionCount?: number;
  difficulty?: 'EASY' | 'MEDIUM' | 'HARD';
}

export interface GeneratedAssessment {
  title: string;
  description: string;
  timeLimitMin: number;
  passingScore: number;
  questions: Array<{
    type: 'MCQ' | 'MULTI_SELECT' | 'TRUE_FALSE' | 'SHORT_ANSWER';
    prompt: string;
    topic?: string;
    difficulty?: 'EASY' | 'MEDIUM' | 'HARD';
    points: number;
    correctText?: string;
    explanation?: string;
    options?: Array<{ text: string; isCorrect: boolean }>;
  }>;
}

const generatedSchema = z.object({
  title: z.string().min(2).max(160),
  description: z.string().max(2000),
  timeLimitMin: z.number().int().min(5).max(180),
  passingScore: z.number().int().min(0).max(100),
  questions: z
    .array(
      z.object({
        type: z.enum(['MCQ', 'MULTI_SELECT', 'TRUE_FALSE', 'SHORT_ANSWER']),
        prompt: z.string().min(1).max(4000),
        topic: z.string().max(80).optional(),
        difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']).optional(),
        points: z.number().int().min(1).max(100),
        correctText: z.string().max(500).optional(),
        explanation: z.string().max(1000).optional(),
        options: z
          .array(z.object({ text: z.string().min(1).max(500), isCorrect: z.boolean() }))
          .max(10)
          .optional(),
      }),
    )
    .min(1)
    .max(40),
});

export function generateAssessmentHeuristic(input: GenerateAssessmentInput): GeneratedAssessment {
  const topic = input.topicHint?.trim() || 'course fundamentals';
  const difficulty = input.difficulty ?? 'MEDIUM';
  const questions: GeneratedAssessment['questions'] = [
    {
      type: 'MCQ',
      prompt: `Which statement best describes ${topic} in "${input.courseTitle}"?`,
      topic,
      difficulty,
      points: 1,
      options: [
        { text: `A core concept of ${topic}`, isCorrect: true },
        { text: 'An unrelated networking protocol', isCorrect: false },
        { text: 'A database isolation level only', isCorrect: false },
        { text: 'A CSS layout mode', isCorrect: false },
      ],
      explanation: 'Pick the option that matches the course topic.',
    },
    {
      type: 'TRUE_FALSE',
      prompt: `${topic} is relevant to ${input.courseTitle}.`,
      topic,
      difficulty,
      points: 1,
      options: [
        { text: 'True', isCorrect: true },
        { text: 'False', isCorrect: false },
      ],
    },
    {
      type: 'MCQ',
      prompt: `What is a practical next step after learning ${topic}?`,
      topic,
      difficulty,
      points: 1,
      options: [
        { text: 'Build a small project applying the concept', isCorrect: true },
        { text: 'Ignore practice and only read docs', isCorrect: false },
        { text: 'Skip assessments entirely', isCorrect: false },
        { text: 'Avoid debugging', isCorrect: false },
      ],
    },
    {
      type: 'SHORT_ANSWER',
      prompt: `In one sentence, define ${topic}.`,
      topic,
      difficulty,
      points: 2,
      correctText: topic,
      explanation: 'Accept answers that correctly define the topic.',
    },
    {
      type: 'MCQ',
      prompt: `Which skill helps most when stuck on ${topic}?`,
      topic,
      difficulty,
      points: 1,
      options: [
        { text: 'Reading errors and testing small examples', isCorrect: true },
        { text: 'Copying code without understanding', isCorrect: false },
        { text: 'Skipping the failing test', isCorrect: false },
        { text: 'Deleting the project', isCorrect: false },
      ],
    },
  ];

  return {
    title: `${input.courseTitle}: ${topic} quiz`,
    description: `Auto-generated practice quiz on ${topic} for ${input.batchName ?? 'the batch'}.`,
    timeLimitMin: 30,
    passingScore: 60,
    questions: questions.slice(0, Math.max(3, Math.min(10, input.questionCount ?? 5))),
  };
}

/**
 * AI quiz/assessment generator — Gemini or Anthropic when configured.
 */
export async function generateAssessment(
  input: GenerateAssessmentInput,
  env: NodeJS.ProcessEnv = process.env,
): Promise<GeneratedAssessment> {
  const cfg = resolveLlmConfig(env);
  if (!cfg) return generateAssessmentHeuristic(input);

  const count = Math.max(3, Math.min(15, input.questionCount ?? 8));
  try {
    const system =
      'You are an expert LMS assessment designer for a coding academy. ' +
      'Generate a fair quiz matched to the course. Prefer MCQ and TRUE_FALSE with clear single correct answers. ' +
      'Respond with ONLY valid JSON matching the shape given — no markdown.';

    const shape = {
      title: 'string',
      description: 'string',
      timeLimitMin: 30,
      passingScore: 60,
      questions: [
        {
          type: 'MCQ|MULTI_SELECT|TRUE_FALSE|SHORT_ANSWER',
          prompt: 'string',
          topic: 'string',
          difficulty: 'EASY|MEDIUM|HARD',
          points: 1,
          options: [{ text: 'string', isCorrect: true }],
          correctText: 'for SHORT_ANSWER only',
          explanation: 'string',
        },
      ],
    };

    const user = [
      `Course: ${input.courseTitle}`,
      input.courseLevel ? `Level: ${input.courseLevel}` : '',
      input.batchName ? `Batch: ${input.batchName}` : '',
      input.topicHint ? `Topic focus: ${input.topicHint}` : '',
      `Difficulty preference: ${input.difficulty ?? 'MEDIUM'}`,
      `Generate exactly ${count} questions.`,
      'For MCQ/MULTI_SELECT/TRUE_FALSE include options with exactly the right isCorrect flags.',
      'TRUE_FALSE must have options True/False.',
      `Return JSON of exactly this shape: ${JSON.stringify(shape)}`,
    ]
      .filter(Boolean)
      .join('\n');

    const json = await completeJson(system, user, 3500, env);
    const parsed = generatedSchema.parse(json);

    // Sanity: objective questions need options + a correct answer.
    parsed.questions = parsed.questions.filter((q) => {
      if (q.type === 'SHORT_ANSWER') return Boolean(q.correctText?.trim());
      const opts = q.options ?? [];
      return opts.length >= 2 && opts.some((o) => o.isCorrect);
    });
    if (parsed.questions.length < 3) throw new Error('Too few valid questions from LLM');
    return parsed;
  } catch {
    return generateAssessmentHeuristic(input);
  }
}
