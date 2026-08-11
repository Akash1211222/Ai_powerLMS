import { z } from 'zod';
import { completeJson, resolveLlmConfig } from './complete-json';

/**
 * Explains why a coding submission failed, and nudges the student toward the
 * fix without handing it over.
 *
 * The point is to keep the student working. A hint that contains the answer
 * turns a failed attempt into a copy-paste, so both the model prompt and the
 * deterministic fallback are constrained to describe the *shape* of the
 * mistake — which line, which category, what to reconsider — never the
 * corrected code.
 *
 * Runs against real evidence: the failing cases, what the program actually
 * printed, and any compiler or runtime output.
 */

export interface FailedCase {
  name: string | null;
  stdin: string;
  expectedOutput: string;
  actualOutput: string;
  stderr: string | null;
  timedOut: boolean;
}

export interface CodeHintInput {
  language: string;
  instructions: string | null;
  source: string;
  failures: FailedCase[];
  passedCount: number;
  totalCount: number;
}

export interface CodeHint {
  /** One line naming what is wrong. */
  diagnosis: string;
  /** 1-based line in the student's source, when it can be pinpointed. */
  line: number | null;
  /** Why that produces the observed output. */
  explanation: string;
  /** A next step to try — never the corrected code. */
  hint: string;
  provider: 'heuristic' | 'llm';
}

const hintSchema = z.object({
  diagnosis: z.string().min(3).max(300),
  line: z.number().int().positive().nullable(),
  explanation: z.string().min(3).max(1200),
  hint: z.string().min(3).max(800),
});

/** Pulls a 1-based source line out of a runtime/compiler message. */
export function parseErrorLine(stderr: string | null, language: string): number | null {
  if (!stderr) return null;
  const patterns: RegExp[] = [
    /line (\d+)/i, // Python traceback, generic
    /\.java:(\d+)/, // javac / JVM
    /\.(?:c|cpp|cc|h):(\d+):/, // gcc / clang
    /:(\d+):\d+:/, // tsc, many linters
    /<anonymous>:(\d+):\d+/, // Node eval frames
  ];
  for (const re of patterns) {
    const m = stderr.match(re);
    if (m?.[1]) {
      const n = Number(m[1]);
      if (Number.isFinite(n) && n > 0) return n;
    }
  }
  return null;
}

type Category =
  | 'timeout'
  | 'compile'
  | 'crash'
  | 'no-output'
  | 'extra-output'
  | 'wrong-order'
  | 'formatting'
  | 'value';

/** Classifies a failure from its evidence, most specific first. */
export function classifyFailure(f: FailedCase): Category {
  if (f.timedOut) return 'timeout';
  const err = (f.stderr ?? '').toLowerCase();
  if (err) {
    if (/(syntaxerror|expected|error:.*before|cannot find symbol|parse error)/.test(err)) {
      return 'compile';
    }
    return 'crash';
  }
  const actual = f.actualOutput.trim();
  const expected = f.expectedOutput.trim();
  if (!actual) return 'no-output';

  const aLines = actual.split('\n').map((l) => l.trim()).filter(Boolean);
  const eLines = expected.split('\n').map((l) => l.trim()).filter(Boolean);
  if (aLines.length > eLines.length) return 'extra-output';
  // Same values, different sequence — an ordering bug, not a maths bug.
  if (
    aLines.length === eLines.length &&
    [...aLines].sort().join('|') === [...eLines].sort().join('|')
  ) {
    return 'wrong-order';
  }
  // Same content ignoring case/spacing — a presentation problem.
  const squash = (s: string) => s.toLowerCase().replace(/\s+/g, '');
  if (squash(actual) === squash(expected)) return 'formatting';
  return 'value';
}

const GUIDANCE: Record<Category, { diagnosis: string; explanation: string; hint: string }> = {
  timeout: {
    diagnosis: 'The program ran out of time',
    explanation:
      'It was still running when the limit was reached, which usually means a loop never reaches its exit condition, or the approach re-computes the same work repeatedly as the input grows.',
    hint: 'Trace the loop that handles the largest input: what has to change on each pass for it to stop? If it does stop, count roughly how many operations it performs and consider whether a single pass or a lookup could replace a nested scan.',
  },
  compile: {
    diagnosis: 'The code did not compile',
    explanation:
      'The compiler rejected the source before any of it ran, so no test could be attempted. The message names the first place it gave up — the real mistake is usually on that line or the one above it.',
    hint: 'Read the first error only and fix that; later errors are often knock-on effects that disappear on their own. Check the line above for a missing bracket, semicolon or type.',
  },
  crash: {
    diagnosis: 'The program threw an error while running',
    explanation:
      'It started, then hit a condition it was not written to handle. The exception type says which assumption broke — an index outside a collection, a name that was never defined, or a value of an unexpected type.',
    hint: 'Look at the values going into the failing line for this specific input. Which one is not the shape you assumed it would be, and where should that be checked before you use it?',
  },
  'no-output': {
    diagnosis: 'The program printed nothing',
    explanation:
      'It ran without error but produced no output, so either the result is computed and never printed, or the branch that prints was never reached for this input.',
    hint: 'Check that the result is actually printed rather than only returned, and confirm the code path for this input reaches the print at all.',
  },
  'extra-output': {
    diagnosis: 'The program printed more than was asked for',
    explanation:
      'The expected values are there but so is other text. Output is compared line by line, so debugging prints and extra prompts count as wrong answers.',
    hint: 'Remove anything printed that the brief did not ask for — debug traces and prompt text especially — and print each required value exactly once.',
  },
  'wrong-order': {
    diagnosis: 'The right values came out in the wrong order',
    explanation:
      'Every expected value is present, so the computation is sound; the sequence is not. That usually points at iteration order or a missing sort.',
    hint: 'Decide what the ordering is supposed to be, then check whether the structure you iterate preserves it — and whether the sort you rely on is actually applied before printing.',
  },
  formatting: {
    diagnosis: 'The answer is right but formatted differently',
    explanation:
      'Ignoring case and spacing the output matches, so the logic is correct — the presentation is not. Comparison forgives trailing spaces and a missing final newline, but not case or spacing inside a line.',
    hint: 'Match the expected output character for character: capitalisation, separators, and how numbers are rendered (decimal places, thousands separators).',
  },
  value: {
    diagnosis: 'The computed value is wrong',
    explanation:
      'The program ran and printed something of the right shape, but the value differs from what the case expects, so the calculation or the condition producing it is off.',
    hint: 'Work this one case through by hand and compare against what the code does step by step. The first point where the two disagree is the mistake — boundaries and comparison operators are the usual culprits.',
  },
};

/**
 * Deterministic hint from the failure evidence.
 *
 * This is not a stopgap: with no AI provider configured it is the only hint a
 * student gets, so it works from the same signals a human would read — the
 * error text, the line it names, and how the actual output differs from the
 * expected one.
 */
export function codeHintHeuristic(input: CodeHintInput): CodeHint {
  const first = input.failures[0];
  if (!first) {
    return {
      diagnosis: 'All test cases passed',
      line: null,
      explanation: 'Every case the trainer defined produced the expected output.',
      hint: 'Re-read the brief for anything it asks for that the cases do not check, such as structure or naming.',
      provider: 'heuristic',
    };
  }

  const category = classifyFailure(first);
  const g = GUIDANCE[category];
  const line = parseErrorLine(first.stderr, input.language);
  const label = first.name ? `"${first.name}"` : 'the first failing case';

  const scope =
    input.passedCount > 0
      ? `${input.passedCount} of ${input.totalCount} cases pass, so the approach is partly right — ${label} is where it breaks.`
      : `No cases pass yet, so start with ${label}.`;

  return {
    diagnosis: g.diagnosis,
    line,
    explanation: `${scope} ${g.explanation}`,
    hint: g.hint,
    provider: 'heuristic',
  };
}

/** Redacts anything that looks like a finished answer before returning a hint. */
function stripSolutions(hint: string): string {
  // A fenced block in a hint is almost always the model handing over the fix.
  return hint.replace(/```[\s\S]*?```/g, '').trim();
}

export async function generateCodeHint(
  input: CodeHintInput,
  env: NodeJS.ProcessEnv = process.env,
): Promise<CodeHint> {
  if (!resolveLlmConfig(env) || input.failures.length === 0) {
    return codeHintHeuristic(input);
  }

  try {
    const system = [
      'You are a patient programming tutor reviewing why a student\'s submission failed its tests.',
      '',
      'Your job is to make the student find the bug, not to fix it for them.',
      'Never output corrected code, a code block, or a line the student can paste.',
      'Name the line and the reasoning error; let them make the edit.',
      '',
      'Point at ONE problem — the one that explains the most failures. If several',
      'cases fail for the same reason, say so rather than listing them.',
      'If the evidence does not pin down a line, return null for line rather than guessing.',
      'Respond with ONLY valid JSON — no markdown.',
    ].join('\n');

    const numbered = input.source
      .split('\n')
      .map((l, i) => `${i + 1}: ${l}`)
      .slice(0, 400)
      .join('\n');

    const failureBlock = input.failures
      .slice(0, 3)
      .map((f, i) =>
        [
          `Case ${i + 1}${f.name ? ` (${f.name})` : ''}${f.timedOut ? ' [TIMED OUT]' : ''}`,
          `  stdin: ${JSON.stringify(f.stdin)}`,
          `  expected: ${JSON.stringify(f.expectedOutput)}`,
          `  actual: ${JSON.stringify(f.actualOutput)}`,
          f.stderr ? `  stderr: ${f.stderr.slice(0, 600)}` : '',
        ]
          .filter(Boolean)
          .join('\n'),
      )
      .join('\n\n');

    const user = [
      `Language: ${input.language}`,
      input.instructions ? `Brief: ${input.instructions.slice(0, 1500)}` : '',
      `Cases passing: ${input.passedCount}/${input.totalCount}`,
      '',
      'Student source (line-numbered):',
      numbered,
      '',
      'Failing cases:',
      failureBlock,
      '',
      'Return JSON: { "diagnosis": string, "line": number|null, "explanation": string, "hint": string }',
    ]
      .filter(Boolean)
      .join('\n');

    const json = await completeJson(system, user, 1024, env);
    const parsed = hintSchema.parse(json);
    const lineCount = input.source.split('\n').length;
    return {
      diagnosis: parsed.diagnosis,
      // Drop a line number the model invented past the end of the file.
      line: parsed.line && parsed.line <= lineCount ? parsed.line : null,
      explanation: parsed.explanation,
      hint: stripSolutions(parsed.hint) || codeHintHeuristic(input).hint,
      provider: 'llm',
    };
  } catch {
    return codeHintHeuristic(input);
  }
}
