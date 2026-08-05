import { z } from 'zod';
import { completeJson, resolveLlmConfig } from './complete-json';

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
  /** Preferred compiler language from the teacher UI (optional). */
  languageHint?: CodeLanguage | null;
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
  instructions: z.string().max(8000),
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

/** Infer compiler language from course title + optional topic. */
export function inferLanguageFromCourse(
  courseTitle: string,
  topicHint?: string | null,
): CodeLanguage {
  const t = `${courseTitle} ${topicHint ?? ''}`.toLowerCase();
  if (/\b(python|pandas|numpy|django|flask|fastapi|data.?analytics|machine.?learning|\bml\b)\b/.test(t))
    return 'PYTHON';
  if (/\b(java)\b/.test(t) && !/\b(javascript|typescript)\b/.test(t)) return 'JAVA';
  if (/\b(c\+\+|cpp|stl)\b/.test(t)) return 'CPP';
  if (/\bc\b/.test(t) && !/\b(css|react|next|c\+\+)\b/.test(t)) return 'C';
  if (/\b(sql|postgres|mysql|database|dbms|joins?)\b/.test(t)) return 'SQL';
  if (/\b(html|css|frontend|ui.?ux|web.?design|dom)\b/.test(t) && !/\b(node|express|api)\b/.test(t))
    return 'WEB';
  if (/\b(typescript|next\.?js|nestjs|tsx)\b/.test(t)) return 'TYPESCRIPT';
  if (
    /\b(javascript|js|node|react|async|await|promise|closure|full.?stack|mern|mean|rest|express)\b/.test(
      t,
    )
  )
    return 'JAVASCRIPT';
  if (/\b(full.?stack|software|dev|programming|coding)\b/.test(t)) return 'JAVASCRIPT';
  return 'NONE';
}

const CODE_RUBRIC = [
  { title: 'Correctness', description: 'Solution produces the expected result / meets requirements', weight: 40 },
  { title: 'Code quality', description: 'Readable structure, naming, and organization', weight: 30 },
  { title: 'Completeness', description: 'Edge cases, instructions followed, runnable in the emulator', weight: 30 },
];

const TEXT_RUBRIC = [
  { title: 'Correctness', description: 'Answer addresses the problem accurately', weight: 40 },
  { title: 'Clarity', description: 'Well explained and structured', weight: 30 },
  { title: 'Completeness', description: 'Covers all required points', weight: 30 },
];

type TopicPack = {
  title: string;
  description: string;
  instructions: string;
  starterCode: string;
};

/** Topic-aware coding packs — used when Gemini is unavailable. */
function topicCodingPack(language: Exclude<CodeLanguage, 'NONE'>, topic: string): TopicPack {
  const t = topic.toLowerCase();

  if (language === 'JAVASCRIPT' || language === 'TYPESCRIPT') {
    const ts = language === 'TYPESCRIPT';
    if (/\b(async|await|promise)\b/.test(t)) {
      return {
        title: `${ts ? 'TypeScript' : 'JS'} lab — ${topic}`,
        description: `Build and run an async/await workflow in the in-browser ${ts ? 'TypeScript' : 'JavaScript'} emulator.`,
        instructions: [
          `Topic focus: ${topic}`,
          '',
          'Implement in the emulator:',
          '1. `fetchUser(id)` — returns a Promise that resolves after ~300ms with `{ id, name }`.',
          '2. `loadDashboard(id)` — async function that awaits fetchUser and returns a greeting string.',
          '3. Call `loadDashboard(1)` and console.log the result.',
          '4. Also demonstrate a rejected Promise path with try/catch.',
          '',
          'Acceptance: code runs without syntax errors; console shows success and error handling.',
        ].join('\n'),
        starterCode: ts
          ? `type User = { id: number; name: string };

function fetchUser(id: number): Promise<User> {
  return new Promise((resolve) => {
    setTimeout(() => resolve({ id, name: 'Ada' }), 300);
  });
}

async function loadDashboard(id: number): Promise<string> {
  // TODO: await fetchUser and return a greeting
  return '';
}

async function main() {
  // TODO: call loadDashboard, then trigger an error path with try/catch
}

main();
`
          : `function fetchUser(id) {
  return new Promise((resolve) => {
    setTimeout(() => resolve({ id, name: 'Ada' }), 300);
  });
}

async function loadDashboard(id) {
  // TODO: await fetchUser and return a greeting string
  return '';
}

async function main() {
  // TODO: call loadDashboard(1) and console.log
  // TODO: also demo try/catch on a rejecting promise
}

main();
`,
      };
    }
    if (/\b(array|object|destructur|map|filter|reduce)\b/.test(t)) {
      return {
        title: `${ts ? 'TS' : 'JS'} lab — ${topic}`,
        description: `Practice ${topic} with runnable array/object transforms in the emulator.`,
        instructions: [
          `Topic focus: ${topic}`,
          '',
          'Given `const students = [{name:"A",score:80},{name:"B",score:55},{name:"C",score:90}]`:',
          '1. Use map/filter/reduce to compute average score.',
          '2. Return names of students with score >= 70.',
          '3. console.log both results.',
          '',
          'Acceptance: prints average and passing names when Run is clicked.',
        ].join('\n'),
        starterCode: `${ts ? 'type Student = { name: string; score: number };\nconst students: Student[]' : 'const students'} = [
  { name: 'A', score: 80 },
  { name: 'B', score: 55 },
  { name: 'C', score: 90 },
];

function summarize(list${ts ? ': Student[]' : ''}) {
  // TODO: average + passing names using map/filter/reduce
  return { average: 0, passing: []${ts ? ' as string[]' : ''} };
}

const result = summarize(students);
console.log(result);
`,
      };
    }
    if (/\b(rest|api|fetch|http|express)\b/.test(t)) {
      return {
        title: `${ts ? 'TS' : 'JS'} lab — ${topic}`,
        description: `Simulate a REST client flow for ${topic} inside the browser emulator (no real network).`,
        instructions: [
          `Topic focus: ${topic}`,
          '',
          '1. Create an in-memory `db` array of posts `{ id, title }`.',
          '2. Implement `api.get(path)`, `api.post(path, body)` returning Promises.',
          '3. Demo: GET /posts, POST /posts, GET /posts again — log each response.',
          '',
          'Acceptance: all three calls log expected shapes when Run is clicked.',
        ].join('\n'),
        starterCode: `const db = [{ id: 1, title: 'Hello' }];

const api = {
  get(path) {
    // TODO: resolve posts for '/posts'
    return Promise.resolve(null);
  },
  post(path, body) {
    // TODO: push a new post and resolve it
    return Promise.resolve(null);
  },
};

async function demo() {
  console.log('GET', await api.get('/posts'));
  console.log('POST', await api.post('/posts', { title: 'New' }));
  console.log('GET', await api.get('/posts'));
}

demo();
`,
      };
    }
    if (/\b(closure|scope|hoist)\b/.test(t)) {
      return {
        title: `JS lab — ${topic}`,
        description: `Demonstrate closures with a counter factory in the JS emulator.`,
        instructions: [
          `Topic focus: ${topic}`,
          '',
          '1. Implement `makeCounter(start)` that returns `{ inc, dec, value }`.',
          '2. Create two independent counters and show they do not share state.',
          '3. console.log values after several operations.',
        ].join('\n'),
        starterCode: `function makeCounter(start = 0) {
  // TODO: closure over private count
  return {
    inc() {},
    dec() {},
    value() { return 0; },
  };
}

const a = makeCounter(0);
const b = makeCounter(10);
// TODO: exercise both and console.log
`,
      };
    }
    // default JS/TS topic pack
    return {
      title: `${ts ? 'TypeScript' : 'JS'} challenge — ${topic}`,
      description: `Hands-on ${topic} coding lab in the in-browser ${ts ? 'TypeScript' : 'JavaScript'} emulator.`,
      instructions: [
        `Topic focus: ${topic}`,
        '',
        'Build a small runnable program that clearly demonstrates the topic:',
        `1. Implement a core function related to "${topic}".`,
        '2. Include at least 2 sample inputs and console.log outputs.',
        '3. Handle one edge case (empty input / invalid value).',
        '',
        'Acceptance: clicking Run prints meaningful output with no syntax errors.',
      ].join('\n'),
      starterCode: ts
        ? `// Topic: ${topic}
function solve(input: string): string {
  // TODO: implement for "${topic}"
  return input;
}

console.log(solve('sample'));
console.log(solve(''));
`
        : `// Topic: ${topic}
function solve(input) {
  // TODO: implement logic for "${topic}"
  return input;
}

console.log('case1', solve('sample'));
console.log('edge', solve(''));
`,
    };
  }

  if (language === 'PYTHON') {
    if (/\b(list|comprehension|dict|pandas|data)\b/.test(t)) {
      return {
        title: `Python lab — ${topic}`,
        description: `Python practice on ${topic} using the in-browser Python emulator.`,
        instructions: [
          `Topic focus: ${topic}`,
          '',
          '1. Start from the sample list of scores.',
          '2. Use list/dict operations (or comprehensions) to compute average and pass list (score>=70).',
          '3. Print a short report.',
          '',
          'Acceptance: program runs and prints average + passers.',
        ].join('\n'),
        starterCode: `# Topic: ${topic}
scores = [55, 70, 88, 42, 91]

def summarize(values):
    # TODO: average + names/indices of passers
    return {"average": 0, "passers": []}

print(summarize(scores))
`,
      };
    }
    return {
      title: `Python lab — ${topic}`,
      description: `Runnable Python assignment focused on ${topic}.`,
      instructions: [
        `Topic focus: ${topic}`,
        '',
        `1. Implement a function that demonstrates "${topic}".`,
        '2. Call it with 2 examples and print results.',
        '3. Include one edge-case print.',
        '',
        'Acceptance: Run succeeds in the Python emulator with clear output.',
      ].join('\n'),
      starterCode: `# Topic: ${topic}
def solve(data):
    # TODO: implement for "${topic}"
    return data

print(solve([1, 2, 3]))
print(solve([]))
`,
    };
  }

  if (language === 'SQL') {
    return {
      title: `SQL lab — ${topic}`,
      description: `Write SQL covering ${topic} in the SQL emulator.`,
      instructions: [
        `Topic focus: ${topic}`,
        '',
        'Assume tables:',
        '  students(id, name, score)',
        '  enrollments(student_id, course)',
        '',
        `Write queries that practice "${topic}" (filters/joins/aggregates as relevant).`,
        'Include at least one SELECT that returns students with score >= 70.',
        '',
        'Acceptance: SQL is valid and matches the topic.',
      ].join('\n'),
      starterCode: `-- Topic: ${topic}
-- students(id, name, score)
SELECT name, score
FROM students
WHERE score >= 70
ORDER BY score DESC;
`,
    };
  }

  if (language === 'JAVA') {
    return {
      title: `Java lab — ${topic}`,
      description: `Java emulator lab on ${topic}.`,
      instructions: [
        `Topic focus: ${topic}`,
        '',
        'In class Main:',
        `1. Implement a method that demonstrates "${topic}".`,
        '2. Call it from main and print results for 2 cases.',
        '',
        'Acceptance: compiles and runs in the Java emulator.',
      ].join('\n'),
      starterCode: `// Topic: ${topic}
public class Main {
  static int solve(int n) {
    // TODO: implement for "${topic}"
    return n;
  }

  public static void main(String[] args) {
    System.out.println(solve(5));
    System.out.println(solve(0));
  }
}
`,
    };
  }

  if (language === 'C' || language === 'CPP') {
    const cpp = language === 'CPP';
    return {
      title: `${cpp ? 'C++' : 'C'} lab — ${topic}`,
      description: `${cpp ? 'C++' : 'C'} emulator exercise on ${topic}.`,
      instructions: [
        `Topic focus: ${topic}`,
        '',
        `1. Implement a small program demonstrating "${topic}".`,
        '2. Print results for a sample input.',
        '',
        'Acceptance: compiles and runs in the emulator.',
      ].join('\n'),
      starterCode: cpp
        ? `#include <iostream>
using namespace std;
// Topic: ${topic}
int solve(int n) {
  // TODO
  return n;
}
int main() {
  cout << solve(5) << endl;
  return 0;
}
`
        : `#include <stdio.h>
/* Topic: ${topic} */
int solve(int n) {
  /* TODO */
  return n;
}
int main(void) {
  printf("%d\\n", solve(5));
  return 0;
}
`,
    };
  }

  // WEB
  return {
    title: `Web lab — ${topic}`,
    description: `HTML/CSS/JS UI task on ${topic} in the web emulator.`,
    instructions: [
      `Topic focus: ${topic}`,
      '',
      '1. Build a small UI that demonstrates the topic.',
      '2. Style with CSS; add one interactive JS behavior.',
      '3. Preview in the web compiler, then submit.',
    ].join('\n'),
    starterCode: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${topic}</title>
  <style>
    body { font-family: system-ui; padding: 1.5rem; background: #f4f7fb; }
    .card { background: white; border-radius: 12px; padding: 1rem 1.25rem; box-shadow: 0 8px 24px rgba(15,23,42,.08); max-width: 420px; }
    button { margin-top: .75rem; padding: .5rem 1rem; border: 0; border-radius: 8px; background: #2563eb; color: white; }
  </style>
</head>
<body>
  <div class="card">
    <h1>${topic}</h1>
    <p id="msg">TODO: build the UI for this topic</p>
    <button id="btn">Action</button>
  </div>
  <script>
    document.getElementById('btn').onclick = () => {
      document.getElementById('msg').textContent = 'Interactive behavior works';
    };
  </script>
</body>
</html>
`,
  };
}

/**
 * Deterministic, topic-aware assignment generator (Gemini fallback).
 * Always opens a coding emulator when a language can be inferred.
 */
export function generateAssignmentHeuristic(input: GenerateAssignmentInput): GeneratedAssignment {
  const language =
    input.languageHint && input.languageHint !== 'NONE'
      ? input.languageHint
      : inferLanguageFromCourse(input.courseTitle, input.topicHint);
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

  const pack = topicCodingPack(language, topic);
  return {
    title: pack.title,
    description: `${pack.description} Course: ${input.courseTitle}${batch}.`,
    instructions: pack.instructions,
    language,
    starterCode: pack.starterCode,
    difficulty,
    maxScore: 100,
    criteria: CODE_RUBRIC,
  };
}

/**
 * AI-backed generator. Uses Gemini/Anthropic when configured; otherwise
 * topic-aware heuristic labs with runnable emulator starter code.
 */
export async function generateAssignment(
  input: GenerateAssignmentInput,
  env: NodeJS.ProcessEnv = process.env,
): Promise<GeneratedAssignment> {
  const languageHint =
    input.languageHint && input.languageHint !== 'NONE'
      ? input.languageHint
      : inferLanguageFromCourse(input.courseTitle, input.topicHint);
  const topic = input.topicHint?.trim() || pickTopic(languageHint, input.courseTitle);

  if (!resolveLlmConfig(env)) {
    return generateAssignmentHeuristic({ ...input, topicHint: topic, languageHint });
  }

  try {
    const system =
      'You are an expert LMS curriculum designer for a coding academy with an in-browser code emulator ' +
      '(Python, JavaScript, TypeScript, Java, C, C++, SQL, Web HTML/CSS/JS). ' +
      'Generate ONE practical coding assignment that is HIGHLY SPECIFIC to the given topic. ' +
      'Do NOT invent a generic unrelated exercise. Title, description, instructions, and starterCode must all mention and practice the topic. ' +
      'starterCode must be runnable in the emulator (incomplete TODOs OK). Prefer the suggested language. ' +
      'Respond with ONLY valid JSON — no markdown.';

    const shape = {
      title: `string including the topic "${topic}"`,
      description: '1-2 sentences tying the task to the topic + emulator',
      instructions:
        'numbered steps the student completes in the code emulator; must be about the topic; include acceptance criteria',
      language: languageHint === 'NONE' ? 'JAVASCRIPT' : languageHint,
      starterCode: 'runnable starter with TODO for the topic (not null for coding languages)',
      difficulty: input.difficulty ?? 'MEDIUM',
      maxScore: 100,
      criteria: [
        { title: 'Correctness', description: 'meets topic requirements', weight: 40 },
        { title: 'Code quality', description: 'readable', weight: 30 },
        { title: 'Completeness', description: 'runs in emulator', weight: 30 },
      ],
    };

    const user = [
      `Course: ${input.courseTitle}`,
      input.courseLevel ? `Level: ${input.courseLevel}` : '',
      input.batchName ? `Batch: ${input.batchName}` : '',
      `REQUIRED TOPIC (must drive the whole assignment): ${topic}`,
      `Compiler language (use this unless impossible): ${languageHint === 'NONE' ? 'JAVASCRIPT' : languageHint}`,
      `Difficulty: ${input.difficulty ?? 'MEDIUM'}`,
      'Students solve this in an online code emulator — include clear Run/submit acceptance criteria.',
      'Criteria weights must sum to 100.',
      `Return JSON of exactly this shape: ${JSON.stringify(shape)}`,
    ]
      .filter(Boolean)
      .join('\n');

    const json = await completeJson(system, user, 4096, env);
    const parsed = generatedSchema.parse(json);

    // Force topic relevance if the model drifted.
    const blob = `${parsed.title} ${parsed.description} ${parsed.instructions}`.toLowerCase();
    const topicToken = topic.toLowerCase().split(/\s+/).find((w) => w.length > 3) ?? topic.toLowerCase();
    if (!blob.includes(topicToken.slice(0, Math.min(topicToken.length, 12)))) {
      parsed.title = `${parsed.title} — ${topic}`.slice(0, 160);
      parsed.description = `${parsed.description} Focus: ${topic}.`;
      parsed.instructions = `Topic focus: ${topic}\n\n${parsed.instructions}`;
    }

    // Prefer coding emulator for academy courses.
    const lang: Exclude<CodeLanguage, 'NONE'> =
      parsed.language === 'NONE'
        ? languageHint === 'NONE'
          ? 'JAVASCRIPT'
          : languageHint
        : parsed.language;
    parsed.language = lang;

    const weightSum = parsed.criteria.reduce((a, c) => a + c.weight, 0);
    if (weightSum !== 100) {
      parsed.criteria = parsed.criteria.map((c) => ({
        ...c,
        weight: Math.max(1, Math.round((c.weight / weightSum) * 100)),
      }));
    }

    if (!parsed.starterCode || parsed.starterCode.trim().length < 20) {
      parsed.starterCode = topicCodingPack(lang, topic).starterCode;
    }

    return parsed;
  } catch {
    return generateAssignmentHeuristic({ ...input, topicHint: topic, languageHint });
  }
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
      return 'async await & promises';
    default:
      return courseTitle.split(/[-–—|]/)[0]?.trim() || 'core concepts';
  }
}
