import {
  executeCode,
  runCodeSchema,
  needsRuntime,
  type RunCodeDto,
  type RunnerTarget,
} from '../code/code.service';

/**
 * Runs a coding submission against its assignment's test cases.
 *
 * This is the half of grading that is not a matter of opinion: the program is
 * executed with each case's stdin and its stdout compared to the expected
 * output. AI then judges what a diff cannot — structure, naming, whether the
 * approach is sound.
 *
 * It runs on the server deliberately. The submit endpoint accepts a
 * `codeOutput` field from the browser, which a student can type anything into;
 * anything derived from that is unverified. Correctness here comes from
 * executing the source we were given.
 */

export type TestCase = {
  id: string;
  name: string | null;
  stdin: string;
  expectedOutput: string;
  isHidden: boolean;
};

export type TestOutcome = {
  testCaseId: string;
  passed: boolean;
  actualOutput: string;
  stderr: string | null;
  timedOut: boolean;
};

/**
 * Compares program output to the expected value.
 *
 * Deliberately forgiving about whitespace a student cannot reasonably control:
 * trailing spaces on a line, a missing or extra final newline, and CRLF from a
 * Windows paste. Everything else — including blank lines in the middle, which
 * usually mean a genuine formatting mistake — must match.
 */
export function outputMatches(actual: string, expected: string): boolean {
  const normalise = (s: string) =>
    s
      .replace(/\r\n/g, '\n')
      .split('\n')
      .map((line) => line.replace(/[ \t]+$/, ''))
      .join('\n')
      .replace(/\n+$/, '');
  return normalise(actual) === normalise(expected);
}

/**
 * Languages the runner can actually execute against cases.
 *
 * Derived rather than listed, from the two facts that already decide it: the
 * language must be one the API accepts, and it must be one that needs a real
 * runtime. WEB renders in the browser and SQL is a syntax check, so neither
 * produces stdout to compare against an expected value.
 *
 * Keeping this in terms of `needsRuntime` means the grader and the runner gate
 * cannot come to disagree about which languages have to be executed.
 */
export function isRunnable(language: string): language is RunCodeDto['language'] {
  const parsed = runCodeSchema.shape.language.safeParse(language);
  return parsed.success && needsRuntime(parsed.data);
}

/**
 * Executes `source` against every case in order.
 *
 * Cases run sequentially rather than in parallel. On the host runner each case
 * spawns a real compiler, and a batch submitting at once would fan out to
 * dozens of concurrent processes on a 1-vCPU box; against an off-box runner
 * the same fan-out is what gets the account rate-limited.
 */
export async function runTestCases(
  language: RunCodeDto['language'],
  source: string,
  cases: TestCase[],
  target: RunnerTarget,
): Promise<TestOutcome[]> {
  const outcomes: TestOutcome[] = [];
  for (const c of cases) {
    try {
      const result = await executeCode({ language, source, stdin: c.stdin }, target);
      const failedToRun = result.timedOut || result.exitCode !== 0;
      outcomes.push({
        testCaseId: c.id,
        passed: !failedToRun && outputMatches(result.stdout, c.expectedOutput),
        actualOutput: result.stdout,
        stderr: result.stderr || result.compileOutput || null,
        timedOut: result.timedOut,
      });
    } catch (err) {
      // A crashed runner is a failed case, not a failed submission — the
      // student still gets a grade for the cases that did run.
      outcomes.push({
        testCaseId: c.id,
        passed: false,
        actualOutput: '',
        stderr: (err as Error).message,
        timedOut: false,
      });
    }
  }
  return outcomes;
}

/** Share of cases passed, 0-1. Returns null when there is nothing to run. */
export function correctnessRatio(outcomes: TestOutcome[]): number | null {
  if (outcomes.length === 0) return null;
  return outcomes.filter((o) => o.passed).length / outcomes.length;
}
