import type { CodeLanguage } from '@/lib/lms-learning-api';

export type PracticeTrack = 'coding' | 'communication' | 'career';

export interface CodingChallenge {
  id: string;
  title: string;
  skillTags: string[];
  track: 'coding';
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  language: Exclude<CodeLanguage, 'NONE'>;
  prompt: string;
  starterCode: string;
  /** Substring(s) that should appear in stdout for a soft pass check. */
  expectedIncludes?: string[];
  hint?: string;
}

export interface SkillArticle {
  id: string;
  title: string;
  track: PracticeTrack;
  minutes: number;
  skillTags: string[];
  summary: string;
  body: string[];
}

export const CODING_CHALLENGES: CodingChallenge[] = [
  {
    id: 'js-fizzbuzz',
    title: 'FizzBuzz warm-up',
    skillTags: ['JavaScript'],
    track: 'coding',
    difficulty: 'EASY',
    language: 'JAVASCRIPT',
    prompt:
      'Print numbers 1–15. For multiples of 3 print Fizz, of 5 print Buzz, of both print FizzBuzz. One value per line.',
    starterCode: `// Print 1..15 with FizzBuzz rules
for (let i = 1; i <= 15; i++) {
  // TODO
  console.log(i);
}
`,
    expectedIncludes: ['Fizz', 'Buzz', 'FizzBuzz'],
    hint: 'Check i % 15 === 0 before the separate 3 and 5 cases.',
  },
  {
    id: 'js-array-sum',
    title: 'Sum of odds',
    skillTags: ['JavaScript'],
    track: 'coding',
    difficulty: 'EASY',
    language: 'JAVASCRIPT',
    prompt: 'Given nums = [1,2,3,4,5,6,7], print the sum of odd numbers only.',
    starterCode: `const nums = [1, 2, 3, 4, 5, 6, 7];
// TODO: sum of odds → console.log
`,
    expectedIncludes: ['16'],
  },
  {
    id: 'js-async-delay',
    title: 'Async await greeting',
    skillTags: ['JavaScript'],
    track: 'coding',
    difficulty: 'MEDIUM',
    language: 'JAVASCRIPT',
    prompt:
      'Write an async function greet(name) that waits ~100ms then returns "Hello, <name>!". Call it and console.log the result.',
    starterCode: `function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function greet(name) {
  // TODO: await wait(100) then return greeting
  return '';
}

greet('Ada').then((msg) => console.log(msg));
`,
    expectedIncludes: ['Hello, Ada'],
  },
  {
    id: 'py-palindrome',
    title: 'Palindrome check',
    skillTags: ['Python'],
    track: 'coding',
    difficulty: 'EASY',
    language: 'PYTHON',
    prompt: 'Print True if "racecar" is a palindrome, else False. Ignore case.',
    starterCode: `word = "racecar"
# TODO: print True/False
`,
    expectedIncludes: ['True'],
  },
  {
    id: 'py-freq',
    title: 'Word frequency',
    skillTags: ['Python', 'Pandas'],
    track: 'coding',
    difficulty: 'MEDIUM',
    language: 'PYTHON',
    prompt:
      'From text = "to be or not to be", print a dict of word → count (any readable format is fine).',
    starterCode: `text = "to be or not to be"
# TODO: count words and print
`,
    expectedIncludes: ['to', 'be'],
  },
  {
    id: 'sql-select',
    title: 'Filter high scorers',
    skillTags: ['SQL', 'Joins'],
    track: 'coding',
    difficulty: 'EASY',
    language: 'SQL',
    prompt:
      'Assume students(id, name, score). Write a SELECT for names with score >= 70 ordered by score DESC.',
    starterCode: `-- students(id, name, score)
SELECT name, score
FROM students
WHERE score >= 70
ORDER BY score DESC;
`,
    expectedIncludes: ['SELECT', 'score'],
  },
  {
    id: 'ts-average',
    title: 'Typed student average',
    skillTags: ['JavaScript'],
    track: 'coding',
    difficulty: 'MEDIUM',
    language: 'TYPESCRIPT',
    prompt:
      'Define type Student = { name: string; score: number }. Compute and print the average of the sample list.',
    starterCode: `type Student = { name: string; score: number };

const roster: Student[] = [
  { name: 'A', score: 80 },
  { name: 'B', score: 90 },
  { name: 'C', score: 70 },
];

function average(list: Student[]): number {
  // TODO
  return 0;
}

console.log(average(roster));
`,
    expectedIncludes: ['80'],
  },
  {
    id: 'web-card',
    title: 'Profile card UI',
    skillTags: ['JavaScript', 'React'],
    track: 'coding',
    difficulty: 'EASY',
    language: 'WEB',
    prompt:
      'Build a simple profile card with name, role, and a button that changes the subtitle when clicked. Style it with CSS.',
    starterCode: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    body { font-family: system-ui; background: #f4f7fb; padding: 2rem; }
    .card { background: white; max-width: 360px; padding: 1.25rem; border-radius: 16px;
      box-shadow: 0 12px 32px rgba(15,23,42,.1); }
    button { margin-top: .75rem; border: 0; border-radius: 8px; padding: .5rem 1rem;
      background: #2563eb; color: white; font-weight: 700; cursor: pointer; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Ada Lovelace</h1>
    <p id="role">Analyst</p>
    <button id="btn">Promote</button>
  </div>
  <script>
    document.getElementById('btn').onclick = () => {
      document.getElementById('role').textContent = 'Senior Engineer';
    };
  </script>
</body>
</html>
`,
  },
];

export const SKILL_ARTICLES: SkillArticle[] = [
  {
    id: 'art-clean-code',
    title: 'Write code humans can read',
    track: 'coding',
    minutes: 5,
    skillTags: ['JavaScript', 'Python'],
    summary: 'Naming, small functions, and comments that earn their keep.',
    body: [
      'Readable code is a skill, not a luxury. Prefer clear names over clever one-liners.',
      'Keep functions short: one job, one return path when possible, and obvious inputs/outputs.',
      'Comment the why, not the what. If a block needs a paragraph, extract a named function instead.',
      'Before you submit a lab, ask: would a teammate understand this in under a minute?',
    ],
  },
  {
    id: 'art-debug',
    title: 'A debugging playbook that always works',
    track: 'coding',
    minutes: 6,
    skillTags: ['JavaScript', 'Python', 'SQL'],
    summary: 'Reproduce → isolate → hypothesize → verify.',
    body: [
      'Reproduce with the smallest input that fails. Delete everything that is not required to see the bug.',
      'Print or log at the boundaries: inputs entering a function, values leaving it.',
      'Change one thing at a time. If you change five things, you learn nothing.',
      'Write the failing case as a tiny script in the Skills Lab so you can re-run it instantly.',
    ],
  },
  {
    id: 'art-apis',
    title: 'Thinking in APIs',
    track: 'coding',
    minutes: 7,
    skillTags: ['APIs', 'Node', 'JavaScript'],
    summary: 'Resources, status codes, and contracts that clients can trust.',
    body: [
      'An API is a contract: paths, payloads, and status codes should be predictable.',
      'Use nouns for resources (/students) and HTTP verbs for actions (GET list, POST create).',
      'Return useful errors (400 with a message) instead of silent 500s when the client is wrong.',
      'Practice by mocking an in-memory API in the JS lab — no network required.',
    ],
  },
  {
    id: 'art-sql-mindset',
    title: 'SQL as storytelling with tables',
    track: 'coding',
    minutes: 6,
    skillTags: ['SQL', 'Joins'],
    summary: 'Filter early, join with intent, aggregate last.',
    body: [
      'Start from the grain you need (one row per student? per enrollment?).',
      'WHERE filters rows before grouping; HAVING filters after aggregates.',
      'INNER JOIN keeps matches; LEFT JOIN keeps the left side even without a match.',
      'Always ask: can this query return duplicates? If yes, GROUP BY or DISTINCT with care.',
    ],
  },
  {
    id: 'art-standup',
    title: 'Own the room in a 60-second standup',
    track: 'communication',
    minutes: 4,
    skillTags: ['Communication'],
    summary: 'Yesterday · today · blockers — crisp and confident.',
    body: [
      'Lead with outcome, not activity: “Shipped the login fix” beats “Worked on auth”.',
      'One blocker max — and name who/what would unblock you.',
      'Drop filler (“um”, “basically”). Pause instead.',
      'Practice aloud once before the call. Your future self will thank you.',
    ],
  },
  {
    id: 'art-feedback',
    title: 'Giving feedback that people can use',
    track: 'communication',
    minutes: 5,
    skillTags: ['Communication'],
    summary: 'Situation · Behavior · Impact · Ask.',
    body: [
      'Describe the situation, the specific behavior, and the impact — then ask a forward question.',
      'Criticize work, not identity. “This function is hard to test” > “You’re messy”.',
      'Balance candor with care. People hear hard truths better when they feel respected.',
      'Invite feedback on your own work first; it models the culture you want.',
    ],
  },
  {
    id: 'art-interview-story',
    title: 'Tell a project story that sticks',
    track: 'career',
    minutes: 6,
    skillTags: ['Communication'],
    summary: 'Context → action → result → learning.',
    body: [
      'Interviewers remember stories, not bullet lists. Pick one project and drill it.',
      'Quantify when you can: “cut load time 40%”, “helped 3 teammates unblock”.',
      'Name your role clearly in a team project — ownership matters.',
      'End with a learning: what you would do differently next time.',
    ],
  },
  {
    id: 'art-email',
    title: 'Emails that get answered',
    track: 'communication',
    minutes: 4,
    skillTags: ['Communication'],
    summary: 'Subject, ask, context, close.',
    body: [
      'Subject line = outcome (“Review needed: attendance PR by Fri”).',
      'First sentence = the ask. Busy people skim.',
      'Then 2–3 lines of context. Link, don’t paste novels.',
      'Close with a clear next step and thanks — then stop writing.',
    ],
  },
];

export const SOFT_DRILLS = [
  {
    id: 'drill-elevator',
    title: '30-second elevator pitch',
    prompt:
      'Record (or write) a 30-second pitch: who you are, what you’re learning, and the role you want. Keep it under 80 words.',
    tip: 'Smile in your voice. End with energy, not “yeah… that’s it”.',
  },
  {
    id: 'drill-conflict',
    title: 'Disagreement without drama',
    prompt:
      'Write 4 sentences you’d say when a teammate pushes a risky shortcut. Stay respectful, firm, and solution-focused.',
    tip: 'Lead with shared goal (“We both want this shipped safely…”).',
  },
  {
    id: 'drill-retro',
    title: 'Mini retro',
    prompt:
      'For your last assignment: one thing that went well, one that hurt, one experiment for next time.',
    tip: 'Be specific — “tests passed on first run” beats “it was good”.',
  },
];
