import { z } from 'zod';

/** Mirrors the Prisma CodeLanguage enum (string-typed to avoid a client dep). */
export type CodeLang =
  | 'NONE'
  | 'PYTHON'
  | 'JAVASCRIPT'
  | 'TYPESCRIPT'
  | 'JAVA'
  | 'C'
  | 'CPP'
  | 'SQL'
  | 'WEB';

export interface GeneratedAssignment {
  title: string;
  description: string;
  instructions: string;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  language: CodeLang;
  starterCode: string | null;
  criteria: Array<{ title: string; description?: string; weight: number }>;
}

const generatedAssignmentSchema = z.object({
  title: z.string().min(4).max(160),
  description: z.string().max(2000),
  instructions: z.string().max(5000),
  difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']),
  language: z.enum(['NONE', 'PYTHON', 'JAVASCRIPT', 'TYPESCRIPT', 'JAVA', 'C', 'CPP', 'SQL', 'WEB']),
  starterCode: z.string().max(8000).nullable().optional(),
  criteria: z
    .array(
      z.object({
        title: z.string().min(1).max(160),
        description: z.string().max(500).optional(),
        weight: z.number().int().min(1).max(100),
      }),
    )
    .min(2)
    .max(6),
});
const generatedListSchema = z.array(generatedAssignmentSchema).min(1);

/** Infer the primary coding language of a course from its title. */
export function detectCourseLanguage(courseTitle: string): CodeLang {
  const t = courseTitle.toLowerCase();
  if (/\b(sql|database|postgres|mysql)\b/.test(t)) return 'SQL';
  if (/\bjava\b(?!script)/.test(t)) return 'JAVA';
  if (/(html|css|ui design|frontend design)/.test(t)) return 'WEB';
  if (/(typescript)/.test(t)) return 'TYPESCRIPT';
  if (/(full ?stack|javascript|react|node|mern|web|frontend|backend)/.test(t)) return 'JAVASCRIPT';
  if (/(python|data|pandas|numpy|ml|machine learning|ai|analytics|science)/.test(t)) return 'PYTHON';
  if (/(c\+\+|cpp)/.test(t)) return 'CPP';
  return 'NONE';
}

const RUBRIC_CODE = [
  { title: 'Correctness', description: 'Program runs and produces the expected output for all cases.', weight: 50 },
  { title: 'Code quality', description: 'Readable naming, sensible structure, no dead code.', weight: 30 },
  { title: 'Approach & explanation', description: 'Comments or notes explain the reasoning.', weight: 20 },
];

const RUBRIC_TEXT = [
  { title: 'Understanding', description: 'Demonstrates clear grasp of the concept.', weight: 40 },
  { title: 'Completeness', description: 'Covers every part of the brief.', weight: 35 },
  { title: 'Clarity', description: 'Well-organized, easy to follow.', weight: 25 },
];

/**
 * Curated, real assignment templates per language. Used when no LLM key is
 * configured and as a deterministic fallback — every template runs in the
 * in-browser compiler.
 */
const TEMPLATES: Record<CodeLang, GeneratedAssignment[]> = {
  PYTHON: [
    {
      title: 'Python Warm-up: FizzBuzz with a Twist',
      description: 'Classic control-flow drill to verify loops, conditionals and string building.',
      instructions:
        'Write a function fizzbuzz(n) that returns a list of strings for 1..n: multiples of 3 → "Fizz", of 5 → "Buzz", of both → "FizzBuzz", otherwise the number. Then print the result for n=20, one item per line. Add one extra rule of your own (e.g. multiples of 7 → "Boom") and document it in a comment.',
      difficulty: 'EASY',
      language: 'PYTHON',
      starterCode:
        'def fizzbuzz(n):\n    """Return the fizzbuzz sequence for 1..n as a list of strings."""\n    result = []\n    # your code here\n    return result\n\n\nfor item in fizzbuzz(20):\n    print(item)\n',
      criteria: RUBRIC_CODE,
    },
    {
      title: 'Data Wrangling: Sales Report from Raw Records',
      description: 'Aggregate a list of dictionaries into a per-category summary — the bread and butter of data work.',
      instructions:
        'Given the SALES list of dicts, compute total revenue per category, the best-selling product overall, and the average order value. Print a small formatted report. Use dictionary aggregation (no external libraries).',
      difficulty: 'MEDIUM',
      language: 'PYTHON',
      starterCode:
        'SALES = [\n    {"product": "Laptop", "category": "electronics", "qty": 3, "price": 55000},\n    {"product": "Mouse", "category": "electronics", "qty": 12, "price": 700},\n    {"product": "Desk", "category": "furniture", "qty": 2, "price": 8000},\n    {"product": "Chair", "category": "furniture", "qty": 5, "price": 3500},\n    {"product": "Notebook", "category": "stationery", "qty": 40, "price": 60},\n]\n\n# 1) revenue per category  2) best-selling product by qty  3) average order value\n',
      criteria: RUBRIC_CODE,
    },
    {
      title: 'Algorithms: Top-K Frequent Words',
      description: 'Frequency counting + sorting with tie-breaks; tests algorithmic thinking.',
      instructions:
        'Implement top_k_words(text, k) that returns the k most frequent words (lowercase, alphabetic only). Ties break alphabetically. Print the top 3 for the sample text. Aim for O(n log n) or better and explain your complexity in a comment.',
      difficulty: 'HARD',
      language: 'PYTHON',
      starterCode:
        'def top_k_words(text, k):\n    # your code here\n    return []\n\n\nSAMPLE = (\n    "the quick brown fox jumps over the lazy dog "\n    "the dog barks and the fox runs away quick quick"\n)\nprint(top_k_words(SAMPLE, 3))\n',
      criteria: RUBRIC_CODE,
    },
  ],
  JAVASCRIPT: [
    {
      title: 'JS Fundamentals: Array Transformations',
      description: 'map / filter / reduce fluency check on realistic data.',
      instructions:
        'Using the STUDENTS array: 1) list names of students scoring ≥ 75, 2) compute the class average, 3) build an object grouping student names by grade letter (A ≥ 90, B ≥ 75, C ≥ 60, else D). Use only array methods — no for loops. Print each result.',
      difficulty: 'EASY',
      language: 'JAVASCRIPT',
      starterCode:
        'const STUDENTS = [\n  { name: "Asha", score: 92 },\n  { name: "Vik", score: 78 },\n  { name: "Meera", score: 61 },\n  { name: "Rahul", score: 45 },\n  { name: "Sana", score: 88 },\n];\n\n// 1) names with score >= 75\n// 2) class average\n// 3) group names by grade letter\n',
      criteria: RUBRIC_CODE,
    },
    {
      title: 'Build a Todo Store (in-memory API)',
      description: 'Model the core of a REST backend: state + CRUD functions with validation.',
      instructions:
        'Implement createTodo(title), completeTodo(id), deleteTodo(id) and listTodos(filter) over an in-memory array. IDs auto-increment; completing a missing id should throw. Demonstrate the full lifecycle with console.log calls: create 3 todos, complete one, delete one, list "active" and "done".',
      difficulty: 'MEDIUM',
      language: 'JAVASCRIPT',
      starterCode:
        'const todos = [];\nlet nextId = 1;\n\nfunction createTodo(title) {\n  // your code here\n}\n\nfunction completeTodo(id) {\n  // your code here\n}\n\nfunction deleteTodo(id) {\n  // your code here\n}\n\nfunction listTodos(filter = "all") {\n  // filter: "all" | "active" | "done"\n}\n\n// demo the lifecycle below\n',
      criteria: RUBRIC_CODE,
    },
    {
      title: 'Async Pipeline: Fetch, Retry, Aggregate',
      description: 'Promises, async/await and error handling without a real network.',
      instructions:
        'You are given flakyFetch(id) which randomly fails. Write fetchWithRetry(id, attempts) that retries up to `attempts` times, then fetchAll(ids) that loads all ids in parallel and returns { ok: [...], failed: [...] }. Run it on ids 1..5 and print the aggregate. Do not let one failure reject the whole batch.',
      difficulty: 'HARD',
      language: 'JAVASCRIPT',
      starterCode:
        'function flakyFetch(id) {\n  return new Promise((resolve, reject) => {\n    setTimeout(() => {\n      Math.random() < 0.5 ? resolve({ id, data: `record-${id}` }) : reject(new Error(`fetch ${id} failed`));\n    }, 10);\n  });\n}\n\nasync function fetchWithRetry(id, attempts = 3) {\n  // your code here\n}\n\nasync function fetchAll(ids) {\n  // your code here\n}\n\nfetchAll([1, 2, 3, 4, 5]).then((r) => console.log(r));\n',
      criteria: RUBRIC_CODE,
    },
  ],
  TYPESCRIPT: [
    {
      title: 'TypeScript: Typed Inventory Manager',
      description: 'Interfaces, generics and narrowing on a small domain model.',
      instructions:
        'Define an Item interface (id, name, price, stock). Implement addItem, sellItem(id, qty) (throws when stock is insufficient) and totalValue(). Add a generic findBy<K extends keyof Item>(key, value) helper. Demonstrate each function with console.log.',
      difficulty: 'MEDIUM',
      language: 'TYPESCRIPT',
      starterCode:
        'interface Item {\n  id: number;\n  name: string;\n  price: number;\n  stock: number;\n}\n\nconst inventory: Item[] = [];\n\n// implement addItem, sellItem, totalValue, findBy\n',
      criteria: RUBRIC_CODE,
    },
  ],
  JAVA: [
    {
      title: 'Java Basics: BankAccount Class',
      description: 'Encapsulation and invariants — the first real OOP exercise.',
      instructions:
        'Create a BankAccount class with a private balance, deposit(amount) and withdraw(amount) methods (reject negatives and overdrafts by printing an error), and getBalance(). In main, create an account, run a few operations and print the final balance.',
      difficulty: 'EASY',
      language: 'JAVA',
      starterCode:
        'public class Main {\n    public static void main(String[] args) {\n        // create an account, deposit, withdraw, print balance\n    }\n}\n\nclass BankAccount {\n    private double balance;\n    // implement deposit, withdraw, getBalance\n}\n',
      criteria: RUBRIC_CODE,
    },
    {
      title: 'Collections: Student Gradebook',
      description: 'HashMap + ArrayList practice with aggregate statistics.',
      instructions:
        'Build a gradebook using Map<String, List<Integer>>. Implement addGrade(name, grade), average(name) and topStudent(). Populate it with at least 4 students and print each student\'s average plus the top performer.',
      difficulty: 'MEDIUM',
      language: 'JAVA',
      starterCode:
        'import java.util.*;\n\npublic class Main {\n    static Map<String, List<Integer>> gradebook = new HashMap<>();\n\n    public static void main(String[] args) {\n        // add grades, print averages, print top student\n    }\n\n    static void addGrade(String name, int grade) {\n        // your code here\n    }\n\n    static double average(String name) {\n        return 0; // your code here\n    }\n\n    static String topStudent() {\n        return ""; // your code here\n    }\n}\n',
      criteria: RUBRIC_CODE,
    },
    {
      title: 'OOP Design: Shape Hierarchy',
      description: 'Abstract classes, polymorphism and interfaces working together.',
      instructions:
        'Design an abstract Shape class with area() and perimeter(), concrete Circle and Rectangle, and a Printable interface with describe(). Store mixed shapes in a List<Shape> and print each description with its area formatted to 2 decimals.',
      difficulty: 'HARD',
      language: 'JAVA',
      starterCode:
        'import java.util.*;\n\npublic class Main {\n    public static void main(String[] args) {\n        // build a List<Shape> and print descriptions\n    }\n}\n\n// define Shape, Circle, Rectangle, Printable here\n',
      criteria: RUBRIC_CODE,
    },
  ],
  SQL: [
    {
      title: 'SQL Basics: SELECT and Filtering',
      description: 'Core SELECT / WHERE / ORDER BY on a seeded table.',
      instructions:
        'The starter creates an employees table. Write queries to: 1) list names and salaries of engineers, 2) show the 3 highest-paid employees, 3) count employees per department. Keep the seed statements and add your queries below them — each SELECT\'s output is shown when you run.',
      difficulty: 'EASY',
      language: 'SQL',
      starterCode:
        "CREATE TABLE employees (id INTEGER PRIMARY KEY, name TEXT, department TEXT, salary INTEGER);\nINSERT INTO employees (name, department, salary) VALUES\n ('Asha', 'engineering', 95000),\n ('Vik', 'engineering', 87000),\n ('Meera', 'design', 72000),\n ('Rahul', 'sales', 64000),\n ('Sana', 'engineering', 102000),\n ('Dev', 'sales', 58000);\n\n-- 1) engineers: name, salary\n-- 2) top 3 salaries\n-- 3) headcount per department\n",
      criteria: RUBRIC_CODE,
    },
    {
      title: 'Joins & Aggregations: Order Analytics',
      description: 'INNER JOIN + GROUP BY + HAVING on a two-table schema.',
      instructions:
        'Using the customers and orders tables in the starter, write queries for: 1) total spend per customer (highest first), 2) customers with more than one order, 3) revenue per city. Use joins — no subquery-only solutions.',
      difficulty: 'MEDIUM',
      language: 'SQL',
      starterCode:
        "CREATE TABLE customers (id INTEGER PRIMARY KEY, name TEXT, city TEXT);\nCREATE TABLE orders (id INTEGER PRIMARY KEY, customer_id INTEGER, amount INTEGER);\nINSERT INTO customers (name, city) VALUES ('Asha','Pune'), ('Vik','Mumbai'), ('Meera','Pune'), ('Rahul','Delhi');\nINSERT INTO orders (customer_id, amount) VALUES (1, 1200), (1, 800), (2, 500), (3, 2200), (3, 300), (4, 950);\n\n-- 1) total spend per customer, highest first\n-- 2) customers with > 1 order\n-- 3) revenue per city\n",
      criteria: RUBRIC_CODE,
    },
  ],
  WEB: [
    {
      title: 'Responsive Profile Card',
      description: 'Semantic HTML + modern CSS (flexbox, hover states) in one file.',
      instructions:
        'Build a profile card with an avatar (any placeholder), name, role, short bio and two buttons (Follow / Message). Style it with an embedded <style> block: rounded corners, soft shadow, hover lift effect, and make it centered on the page. Bonus: a dark-mode friendly palette.',
      difficulty: 'EASY',
      language: 'WEB',
      starterCode:
        '<!DOCTYPE html>\n<html>\n<head>\n<style>\n  /* your styles here */\n</style>\n</head>\n<body>\n  <!-- build your profile card here -->\n</body>\n</html>\n',
      criteria: RUBRIC_CODE,
    },
    {
      title: 'Interactive Counter Component',
      description: 'DOM manipulation and event handling without a framework.',
      instructions:
        'Create a counter with +, − and Reset buttons. The count must never go below 0, turn green above 10 and red at 0. Implement it with vanilla JS in a <script> tag. Keep the markup semantic and the styles in a <style> block.',
      difficulty: 'MEDIUM',
      language: 'WEB',
      starterCode:
        '<!DOCTYPE html>\n<html>\n<head>\n<style>\n  /* your styles */\n</style>\n</head>\n<body>\n  <div id="app">\n    <!-- counter UI -->\n  </div>\n  <script>\n    // your logic\n  </script>\n</body>\n</html>\n',
      criteria: RUBRIC_CODE,
    },
  ],
  C: [],
  CPP: [
    {
      title: 'C++ Basics: Vector Statistics',
      description: 'STL vectors, iteration and simple math.',
      instructions:
        'Read the numbers in the starter vector and print the min, max, mean and median. Implement each as a separate function. Use <algorithm> where it helps.',
      difficulty: 'MEDIUM',
      language: 'CPP',
      starterCode:
        '#include <iostream>\n#include <vector>\n#include <algorithm>\nusing namespace std;\n\nint main() {\n    vector<int> nums = {42, 7, 19, 88, 23, 61, 5};\n    // print min, max, mean, median\n    return 0;\n}\n',
      criteria: RUBRIC_CODE,
    },
  ],
  NONE: [
    {
      title: 'Concept Deep-Dive',
      description: 'Written analysis to check conceptual understanding of the current module.',
      instructions:
        'Pick the most challenging concept from this course so far. In 300–500 words: explain it in your ownterms, give one real-world example, and describe one mistake beginners make with it and how to avoid it.',
      difficulty: 'MEDIUM',
      language: 'NONE',
      starterCode: null,
      criteria: RUBRIC_TEXT,
    },
    {
      title: 'Project Retrospective',
      description: 'Reflective writing on applied learning.',
      instructions:
        'Describe something you built or practiced in this course. Cover: what you set out to do, what worked, what broke, and what you would do differently. 250–400 words.',
      difficulty: 'EASY',
      language: 'NONE',
      starterCode: null,
      criteria: RUBRIC_TEXT,
    },
  ],
};

function templatesFor(lang: CodeLang): GeneratedAssignment[] {
  const list = TEMPLATES[lang];
  if (list && list.length > 0) return list;
  return TEMPLATES.NONE;
}

/**
 * Generate course-appropriate assignments. Uses Anthropic when configured
 * (AI_PROVIDER=anthropic + ANTHROPIC_API_KEY), otherwise a curated template
 * bank keyed by the course's detected language. Always returns `count` items.
 */
export async function generateAssignments(opts: {
  courseTitle: string;
  level?: string | null;
  count?: number;
  topic?: string | null;
  env?: NodeJS.ProcessEnv;
}): Promise<{ items: GeneratedAssignment[]; provider: 'anthropic' | 'templates' }> {
  const count = Math.max(1, Math.min(5, opts.count ?? 3));
  const env = opts.env ?? process.env;
  const apiKey = env.ANTHROPIC_API_KEY;
  const useLlm = env.AI_PROVIDER === 'anthropic' && Boolean(apiKey);

  if (useLlm) {
    try {
      const items = await generateWithAnthropic(
        apiKey!,
        env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-20250514',
        opts.courseTitle,
        opts.level ?? null,
        count,
        opts.topic ?? null,
      );
      return { items, provider: 'anthropic' };
    } catch {
      // fall through to templates
    }
  }

  const lang = detectCourseLanguage(opts.courseTitle);
  const bank = templatesFor(lang);
  const items = Array.from({ length: count }, (_, i) => bank[i % bank.length]!).map((t, i) => ({
    ...t,
    // De-duplicate titles when count exceeds the bank size.
    title: i >= bank.length ? `${t.title} (variant ${Math.floor(i / bank.length) + 1})` : t.title,
  }));
  return { items, provider: 'templates' };
}

async function generateWithAnthropic(
  apiKey: string,
  model: string,
  courseTitle: string,
  level: string | null,
  count: number,
  topic: string | null,
): Promise<GeneratedAssignment[]> {
  const system =
    'You are a curriculum designer for a coding bootcamp. Generate practical, runnable coding assignments. ' +
    'Respond with ONLY a JSON array — no prose, no markdown fences.';
  const user = [
    `Course: ${courseTitle}${level ? ` (level: ${level})` : ''}`,
    topic ? `Focus topic: ${topic}` : '',
    `Generate exactly ${count} assignments as a JSON array. Each item shape:`,
    JSON.stringify({
      title: 'string',
      description: 'string, 1-2 sentences',
      instructions: 'string, concrete numbered tasks the student completes in an online code editor',
      difficulty: 'EASY|MEDIUM|HARD',
      language: 'PYTHON|JAVASCRIPT|TYPESCRIPT|JAVA|C|CPP|SQL|WEB|NONE',
      starterCode: 'string starter code the student edits, or null',
      criteria: [{ title: 'string', description: 'string', weight: 'int 1-100' }],
    }),
    'Pick the language that best matches the course. Starter code must run as-is. Criteria weights should sum to 100.',
  ]
    .filter(Boolean)
    .join('\n\n');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 4000,
        system,
        messages: [{ role: 'user', content: user }],
      }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Anthropic API error ${res.status}`);
    const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
    const text = data.content?.find((b) => b.type === 'text')?.text ?? '';
    const start = text.indexOf('[');
    const end = text.lastIndexOf(']');
    if (start === -1 || end === -1) throw new Error('No JSON array in AI response');
    const parsed = generatedListSchema.parse(JSON.parse(text.slice(start, end + 1)));
    return parsed.map((p) => ({ ...p, starterCode: p.starterCode ?? null }));
  } finally {
    clearTimeout(timer);
  }
}
