import type { RunCodeDto, RunCodeResult } from './code.service';

/**
 * Runs student code on somebody else's machine, over the Judge0 API.
 *
 * This exists because the host runner cannot be made safe here. The API
 * process runs as root, on the same box as the LMS database, the landing
 * site's leads and the Gemini key in /opt/fca-lms/.env — so a three-line
 * submission could read all of it. Executing off-box removes that risk
 * instead of trying to contain it.
 *
 * The endpoint is configuration, not a constant, so a rate-limited or
 * whitelisted instance can be replaced by a self-hosted or paid one without
 * touching this file.
 */

/** Languages this runner can execute. WEB and SQL never reach it. */
type RemoteLanguage = Exclude<RunCodeDto['language'], 'WEB' | 'SQL'>;

/**
 * Judge0 language ids, resolved against ce.judge0.com. Pinned rather than
 * looked up per run: /languages is a second round trip, and a silent runtime
 * change under a student mid-course is worse than an explicit bump here.
 */
const JUDGE0_LANGUAGE_ID: Record<RemoteLanguage, number> = {
  PYTHON: 113, // Python 3.14.0
  JAVASCRIPT: 102, // Node.js 22.08.0
  TYPESCRIPT: 101, // TypeScript 5.6.2
  JAVA: 91, // JDK 17.0.6
  C: 103, // GCC 14.1.0
  CPP: 105, // GCC 14.1.0
};

/** https://ce.judge0.com/#statuses-and-languages-status-get */
const ACCEPTED = 3;
const TIME_LIMIT_EXCEEDED = 5;
const COMPILATION_ERROR = 6;
/** 13 = internal error, 14 = exec format error — the runner's fault, not the student's. */
const FIRST_RUNNER_FAULT = 13;

export interface Judge0Response {
  stdout?: string | null;
  stderr?: string | null;
  compile_output?: string | null;
  message?: string | null;
  status?: { id: number; description?: string } | null;
}

function truncate(s: string, n = 12_000) {
  return s.length > n ? `${s.slice(0, n)}\n…(truncated)` : s;
}

/**
 * Translates a Judge0 verdict into the shape the rest of the LMS expects.
 *
 * Exported so it can be tested without a network: the mapping is where the
 * bugs live, not the HTTP call.
 */
export function mapJudge0Result(
  language: RunCodeDto['language'],
  body: Judge0Response,
): RunCodeResult {
  const statusId = body.status?.id ?? 0;
  const compileOutput = body.compile_output?.trim() || undefined;
  const timedOut = statusId === TIME_LIMIT_EXCEEDED;

  // A compile error arrives with an empty stderr and the real message in
  // compile_output; surfacing only stderr would show the student nothing.
  let stderr = body.stderr?.trim() ?? '';
  if (!stderr && statusId === COMPILATION_ERROR) stderr = compileOutput ?? 'Compilation failed.';
  if (!stderr && timedOut) stderr = 'Execution timed out.';
  if (!stderr && statusId >= FIRST_RUNNER_FAULT) {
    stderr = body.message?.trim() || 'The code runner failed to execute this submission.';
  }

  return {
    language,
    stdout: truncate(body.stdout ?? ''),
    stderr: truncate(stderr),
    exitCode: statusId === ACCEPTED ? 0 : 1,
    timedOut,
    compileOutput,
  };
}

export interface RemoteRunnerOptions {
  url: string;
  token?: string;
  timeoutMs: number;
}

/** Submits `dto` to the runner and waits for the verdict. */
export async function executeRemote(
  dto: RunCodeDto,
  opts: RemoteRunnerOptions,
): Promise<RunCodeResult> {
  const languageId = JUDGE0_LANGUAGE_ID[dto.language as RemoteLanguage];
  if (!languageId) {
    throw new Error(`No remote runtime is mapped for ${dto.language}`);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
  try {
    const res = await fetch(
      `${opts.url.replace(/\/+$/, '')}/submissions?base64_encoded=false&wait=true`,
      {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...(opts.token ? { 'X-Auth-Token': opts.token } : {}),
        },
        body: JSON.stringify({
          language_id: languageId,
          source_code: dto.source,
          stdin: dto.stdin ?? '',
        }),
      },
    );

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(
        `Code runner returned ${res.status}${detail ? `: ${truncate(detail, 300)}` : ''}`,
      );
    }

    return mapJudge0Result(dto.language, (await res.json()) as Judge0Response);
  } catch (err) {
    // A runner that is slow, rate-limited or down is reported to the student
    // as a failed run rather than a 500 — and, in grading, costs them the
    // case rather than the whole submission.
    if ((err as Error).name === 'AbortError') {
      return {
        language: dto.language,
        stdout: '',
        stderr: `The code runner did not respond within ${Math.round(opts.timeoutMs / 1000)}s.`,
        exitCode: 1,
        timedOut: true,
      };
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
