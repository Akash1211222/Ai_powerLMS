import { z } from 'zod';

export type CodeLanguage =
  | 'NONE'
  | 'PYTHON'
  | 'JAVASCRIPT'
  | 'TYPESCRIPT'
  | 'JAVA'
  | 'C'
  | 'CPP'
  | 'SQL'
  | 'WEB';

export interface GenerateAssignmentInput {
  courseTitle: string;
  courseLevel?: string | null;
  batchName?: string | null;
  topicHint?: string | null;
  difficulty?: 'EASY' | 'MEDIUM' | 'HARD';
}

export interface GeneratedAssignment {
  title: string;
  description: string;
  instructions: string;
  language: CodeLanguage;
  starterCode: string | null;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  maxScore: number;
  criteria: Array<{ title: string; description: string; weight: number }>;
}

const generatedSchema = z.object({
  title: z.string().min(2).max(160),
  description: z.string().max(2000),
  instructions: z.string().max(5000),
  language: z.enum(['NONE', 'PYTHON', 'JAVASCRIPT', 'TYPESCRIPT', 'JAVA', 'C', 'CPP', 'SQL', 'WEB']),
  starterCode: z.string().max(20000).nullable(),
  difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']),
  maxScore: z.number().int().min(1).max(1000),
  criteria: z
    .array(
      z.object({
        title: z.string().min(1).max(160),
        description: z.string().max(500),
        weight: z.number().int().min(1).max(100),
      }),
    )
    .min(1)
    .max(10),
});

/** Infer the best in-browser compiler language from a course title. */
export function inferLanguageFromCourse(courseTitle: string): CodeLanguage {
  const t = courseTitle.toLowerCase();
  if (/\b(python|data.?analytics|pandas|numpy|ml|machine.?learning)\b/.test(t)) return 'PYTHON';
  if (/\b(java)\b/.test(t) && !/\b(javascript|typescript)\b/.test(t)) return 'JAVA';
  if (/\b(c\+\+|cpp)\b/.test(t)) return 'CPP';
  if (/\bc\b/.test(t) && !/\b(css|react|next)\b/.test(t)) return 'C';
  if (/\b(sql|database|dbms)\b/.test(t)) return 'SQL';
  if (/\b(html|css|frontend|ui.?ux|web.?design)\b/.test(t)) return 'WEB';
  if (/\b(typescript|next\.?js|nestjs)\b/.test(t)) return 'TYPESCRIPT';
  if (/\b(javascript|js|node|react|full.?stack|mern|mean)\b/.test(t)) return 'JAVASCRIPT';
  if (/\b(full.?stack|software|dev|programming|coding)\b/.test(t)) return 'JAVASCRIPT';
  return 'NONE';
}

const STARTERS: Record<Exclude<CodeLanguage, 'NONE'>, string> = {
  PYTHON: `# Write your solution below
def solve():
    # TODO: implement
    pass

if __name__ == "__main__":
    solve()
`,
  JAVASCRIPT: `// Write your solution below
function solve() {
  // TODO: implement
}

solve();
`,
  TYPESCRIPT: `// Write your solution below
function solve(): void {
  // TODO: implement
}

solve();
`,
  JAVA: `public class Main {
  public static void main(String[] args) {
    // TODO: implement
    System.out.println("Hello");
  }
}
`,
  C: `#include <stdio.h>

int main(void) {
  // TODO: implement
  printf("Hello\\n");
  return 0;
}
`,
  CPP: `#include <iostream>
using namespace std;

int main() {
  // TODO: implement
  cout << "Hello" << endl;
  return 0;
}
`,
  SQL: `-- Write your SQL below
SELECT 1 AS result;
`,
  WEB: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Assignment</title>
  <style>
    body { font-family: system-ui; padding: 1.5rem; }
  </style>
</head>
<body>
  <h1>Hello</h1>
  <!-- TODO: build your UI -->
  <script>
    console.log('ready');
  </script>
</body>
</html>
`,
};

const CODE_RUBRIC = [
  { title: 'Correctness', description: 'Solution produces the expected result / meets requirements', weight: 40 },
  { title: 'Code quality', description: 'Readable structure, naming, and organization', weight: 30 },
  { title: 'Completeness', description: 'Edge cases, instructions followed, runnable code', weight: 30 },
];

const TEXT_RUBRIC = [
  { title: 'Correctness', description: 'Answer addresses the problem accurately', weight: 40 },
  { title: 'Clarity', description: 'Well explained and structured', weight: 30 },
  { title: 'Completeness', description: 'Covers all required points', weight: 30 },
];

/**
 * Deterministic, course-aware assignment generator used when Anthropic is not
 * configured. Produces a real, language-matched coding (or written) task.
 */
export function generateAssignmentHeuristic(input: GenerateAssignmentInput): GeneratedAssignment {
  const language = inferLanguageFromCourse(input.courseTitle);
  const difficulty = input.difficulty ?? 'MEDIUM';
  const topic = input.topicHint?.trim() || pickTopic(language, input.courseTitle);
  const batch = input.batchName ? ` (${input.batchName})` : '';

  if (language === 'NONE') {
    return {
      title: `${topic} — written brief`,
      description: `Reflect on ${topic} for ${input.courseTitle}${batch}.`,
      instructions:
        `Write 300–500 words covering: (1) key concepts of ${topic}, ` +
        `(2) a practical example from industry, (3) one challenge and how you would solve it.`,
      language: 'NONE',
      starterCode: null,
      difficulty,
      maxScore: 100,
      criteria: TEXT_RUBRIC,
    };
  }

  const task = codingTask(language, topic);
  return {
    title: task.title,
    description: task.description,
    instructions: task.instructions,
    language,
    starterCode: STARTERS[language],
    difficulty,
    maxScore: 100,
    criteria: CODE_RUBRIC,
  };
}

/**
 * AI-backed generator. Calls Anthropic when a key is present; otherwise uses
 * the course-aware heuristic templates.
 */
export async function generateAssignment(
  input: GenerateAssignmentInput,
  env: NodeJS.ProcessEnv = process.env,
): Promise<GeneratedAssignment> {
  const key = env.ANTHROPIC_API_KEY;
  const kind = env.AI_PROVIDER ?? 'heuristic';
  if (kind !== 'anthropic' || !key) {
    return generateAssignmentHeuristic(input);
  }

  try {
    const languageHint = inferLanguageFromCourse(input.courseTitle);
    const model = env.AI_DEFAULT_MODEL ?? 'claude-opus-4-8';
    const system =
      'You are an expert LMS curriculum designer for an AI-powered coding academy. ' +
      'Generate ONE practical student assignment matched to the course. Prefer coding tasks ' +
      'with the suggested language. Respond with ONLY valid JSON matching the shape given — no markdown.';

    const shape = {
      title: 'string',
      description: 'string',
      instructions: 'string with clear acceptance criteria',
      language: languageHint,
      starterCode: 'string or null — runnable starter for the language',
      difficulty: 'EASY|MEDIUM|HARD',
      maxScore: 100,
      criteria: [{ title: 'string', description: 'string', weight: 40 }],
    };

    const user = [
      `Course: ${input.courseTitle}`,
      input.courseLevel ? `Level: ${input.courseLevel}` : '',
      input.batchName ? `Batch: ${input.batchName}` : '',
      input.topicHint ? `Topic hint: ${input.topicHint}` : '',
      `Suggested language: ${languageHint}`,
      `Difficulty preference: ${input.difficulty ?? 'MEDIUM'}`,
      `Weights of criteria must sum to 100.`,
      `Return JSON of exactly this shape: ${JSON.stringify(shape)}`,
    ]
      .filter(Boolean)
      .join('\n');

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 2000,
        system,
        messages: [{ role: 'user', content: user }],
      }),
    });
    if (!res.ok) throw new Error(`Anthropic ${res.status}`);
    const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
    const text = data.content?.find((b) => b.type === 'text')?.text ?? '';
    const json = JSON.parse(extractJson(text));
    const parsed = generatedSchema.parse(json);
    const weightSum = parsed.criteria.reduce((a, c) => a + c.weight, 0);
    if (weightSum !== 100) {
      // Normalize weights so scoring stays deterministic.
      parsed.criteria = parsed.criteria.map((c) => ({
        ...c,
        weight: Math.max(1, Math.round((c.weight / weightSum) * 100)),
      }));
    }
    if (parsed.language !== 'NONE' && !parsed.starterCode) {
      parsed.starterCode = STARTERS[parsed.language as Exclude<CodeLanguage, 'NONE'>] ?? null;
    }
    return parsed;
  } catch {
    return generateAssignmentHeuristic(input);
  }
}

function extractJson(text: string): string {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('No JSON object in AI response');
  return text.slice(start, end + 1);
}

function pickTopic(language: CodeLanguage, courseTitle: string): string {
  switch (language) {
    case 'PYTHON':
      return 'list comprehensions & data cleaning';
    case 'JAVA':
      return 'classes and OOP basics';
    case 'C':
    case 'CPP':
      return 'arrays and loops';
    case 'SQL':
      return 'SELECT joins & filters';
    case 'WEB':
      return 'responsive card layout';
    case 'TYPESCRIPT':
      return 'typed functions & interfaces';
    case 'JAVASCRIPT':
      return 'arrays, objects & async';
    default:
      return courseTitle.split(/[-–—|]/)[0]?.trim() || 'core concepts';
  }
}

function codingTask(language: CodeLanguage, topic: string): {
  title: string;
  description: string;
  instructions: string;
} {
  const map: Record<Exclude<CodeLanguage, 'NONE'>, { title: string; description: string; instructions: string }> = {
    PYTHON: {
      title: `Python lab — ${topic}`,
      description: `Hands-on Python coding assignment covering ${topic}.`,
      instructions:
        `Write a Python program that:\n` +
        `1. Reads a list of integers (hardcode a sample list is fine).\n` +
        `2. Returns the sum, average, and max.\n` +
        `3. Prints a short summary line.\n` +
        `Run your code in the editor, then submit. AI will score correctness and quality.`,
    },
    JAVASCRIPT: {
      title: `JS challenge — ${topic}`,
      description: `JavaScript coding task focused on ${topic}.`,
      instructions:
        `Implement a function \`todos\` manager that:\n` +
        `1. Starts with an empty array.\n` +
        `2. Supports add(title), remove(index), and list().\n` +
        `3. Demonstrates all three operations with console.log.\n` +
        `Use the in-browser JS compiler, run, then submit for AI scoring.`,
    },
    TYPESCRIPT: {
      title: `TypeScript lab — ${topic}`,
      description: `Typed TypeScript exercise on ${topic}.`,
      instructions:
        `Define an interface \`Student { name: string; score: number }\` and a function\n` +
        `\`average(students: Student[]): number\`. Create sample data, print the average.\n` +
        `Run in the TypeScript compiler and submit.`,
    },
    JAVA: {
      title: `Java lab — ${topic}`,
      description: `Java coding assignment on ${topic}.`,
      instructions:
        `In \`Main\`, create a method \`int sum(int[] arr)\` and print the sum of\n` +
        `{1, 2, 3, 4, 5}. Use proper Java syntax. Run in the Java compiler, then submit.`,
    },
    C: {
      title: `C lab — ${topic}`,
      description: `C programming task on ${topic}.`,
      instructions:
        `Write a C program that prints the factorial of 5 using a loop.\n` +
        `Compile & run in the editor, then submit for AI evaluation.`,
    },
    CPP: {
      title: `C++ lab — ${topic}`,
      description: `C++ coding assignment on ${topic}.`,
      instructions:
        `Write a C++ program that stores 5 integers in a vector-like array and prints them reversed.\n` +
        `Run in the C++ compiler, then submit.`,
    },
    SQL: {
      title: `SQL lab — ${topic}`,
      description: `SQL query practice covering ${topic}.`,
      instructions:
        `Assume a table students(id, name, score).\n` +
        `Write a SELECT that returns names of students with score >= 70 ordered by score DESC.\n` +
        `(You may use a comment to declare the assumed schema.) Submit your SQL for AI scoring.`,
    },
    WEB: {
      title: `Web UI lab — ${topic}`,
      description: `Front-end HTML/CSS/JS assignment on ${topic}.`,
      instructions:
        `Build a simple profile card with: name, role, and a "Contact" button.\n` +
        `Style it with CSS (rounded corners, soft shadow). Preview in the web compiler, then submit.`,
    },
  };
  return map[language as Exclude<CodeLanguage, 'NONE'>];
}
