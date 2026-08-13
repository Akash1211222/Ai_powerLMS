import { describe, it, expect, vi, afterEach } from 'vitest';
import { executeRemote, mapJudge0Result } from './remote-runner';

/**
 * The HTTP call is trivial; the verdict mapping is not. Judge0 reports a
 * compile error with an empty stderr and the real message somewhere else, and
 * a student shown an empty console learns nothing — so each verdict is pinned
 * here rather than exercised against a live runner.
 */
describe('mapJudge0Result', () => {
  it('reports a clean run', () => {
    const r = mapJudge0Result('PYTHON', {
      stdout: '42\n',
      stderr: null,
      status: { id: 3, description: 'Accepted' },
    });

    expect(r).toMatchObject({ stdout: '42\n', stderr: '', exitCode: 0, timedOut: false });
  });

  it('surfaces a compile error that Judge0 reports with an empty stderr', () => {
    const r = mapJudge0Result('JAVA', {
      stdout: null,
      stderr: null,
      compile_output: 'Main.java:1: error: ";" expected',
      status: { id: 6, description: 'Compilation Error' },
    });

    // Without the fallback this is an empty console and a mystified student.
    expect(r.stderr).toContain('error: ";" expected');
    expect(r.compileOutput).toContain('error: ";" expected');
    expect(r.exitCode).toBe(1);
  });

  it('marks a time limit as timed out rather than merely failed', () => {
    // classifyFailure keys off timedOut to tell an infinite loop apart from a
    // wrong answer, so this flag has to be right.
    const r = mapJudge0Result('C', {
      stdout: '',
      status: { id: 5, description: 'Time Limit Exceeded' },
    });

    expect(r.timedOut).toBe(true);
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toMatch(/timed out/i);
  });

  it('keeps a runtime error message', () => {
    const r = mapJudge0Result('PYTHON', {
      stdout: '',
      stderr: 'ZeroDivisionError: division by zero',
      status: { id: 11, description: 'Runtime Error (NZEC)' },
    });

    expect(r.stderr).toContain('ZeroDivisionError');
    expect(r.exitCode).toBe(1);
    expect(r.timedOut).toBe(false);
  });

  it('does not blame the student for the runner falling over', () => {
    const r = mapJudge0Result('CPP', {
      status: { id: 13, description: 'Internal Error' },
      message: 'runner exploded',
    });

    expect(r.stderr).toContain('runner exploded');
    expect(r.exitCode).toBe(1);
  });

  it('treats a missing status as a failure, not a silent pass', () => {
    // A malformed body must not read as exit 0 — that would mark a broken run
    // as a passing test case.
    const r = mapJudge0Result('PYTHON', {});

    expect(r.exitCode).toBe(1);
    expect(r.stdout).toBe('');
  });
});

describe('executeRemote', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends the source and stdin, and strips a trailing slash from the URL', async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) =>
      Response.json({ stdout: 'ok', status: { id: 3 } }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await executeRemote(
      { language: 'PYTHON', source: 'print(1)', stdin: '5' },
      { url: 'https://runner.example/api/', timeoutMs: 5_000 },
    );

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://runner.example/api/submissions?base64_encoded=false&wait=true');
    expect(JSON.parse(String(init.body))).toMatchObject({
      language_id: 113,
      source_code: 'print(1)',
      stdin: '5',
    });
  });

  it('sends the auth token only when one is configured', async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) =>
      Response.json({ stdout: '', status: { id: 3 } }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await executeRemote(
      { language: 'C', source: 'int main(){}' },
      { url: 'https://runner.example', timeoutMs: 5_000 },
    );
    let [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.headers).not.toHaveProperty('X-Auth-Token');

    await executeRemote(
      { language: 'C', source: 'int main(){}' },
      { url: 'https://runner.example', token: 'secret', timeoutMs: 5_000 },
    );
    [, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(init.headers).toMatchObject({ 'X-Auth-Token': 'secret' });
  });

  it('reports a rate-limited or broken runner as an error, not a passing run', async () => {
    // A 429 that mapped to exit 0 would mark every hidden test case as passed.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('rate limited', { status: 429 })),
    );

    await expect(
      executeRemote(
        { language: 'PYTHON', source: 'print(1)' },
        { url: 'https://runner.example', timeoutMs: 5_000 },
      ),
    ).rejects.toThrow(/429/);
  });

  it('turns a runner that never answers into a timeout, not a hung request', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener('abort', () => {
              const err = new Error('aborted');
              err.name = 'AbortError';
              reject(err);
            });
          }),
      ),
    );

    const result = await executeRemote(
      { language: 'JAVA', source: 'public class Main {}' },
      { url: 'https://runner.example', timeoutMs: 20 },
    );

    expect(result.timedOut).toBe(true);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/did not respond/i);
  });
});
