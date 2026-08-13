import { ServiceUnavailableException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { Env } from '../config/env';
import { CodeController } from './code.controller';
import { runCodeSchema, runnerFor, needsRuntime } from './code.service';

/**
 * CODE_RUN_ENABLED is off on the shared VPS and must stay off: the API runs as
 * root beside the database, so spawning student code here would run it as root
 * too. Compiled languages therefore execute off-box instead.
 *
 * These specs pin down what that costs. Refusing to spawn must not also refuse
 * the labs the API answers by itself — that killed the HTML/CSS/JS labs on
 * production for no security gain — and configuring an off-box runner must not
 * quietly re-enable spawning here.
 */
type RunnerEnv = {
  CODE_RUN_ENABLED?: boolean;
  CODE_RUNNER_URL?: string;
  CODE_RUNNER_TOKEN?: string;
  CODE_RUNNER_TIMEOUT_MS?: number;
};

/**
 * Answers per key rather than returning one value for everything — a stub that
 * says `true` to every question also claims CODE_RUNNER_URL is `true`, and
 * would have the controller "pass" against a runner that does not exist.
 */
const controller = (env: RunnerEnv) =>
  new CodeController({
    get: (key: keyof RunnerEnv) => env[key],
  } as unknown as ConfigService<Env, true>);

const hostRunner = { CODE_RUN_ENABLED: true, CODE_RUNNER_TIMEOUT_MS: 20_000 };
const noRunner = { CODE_RUN_ENABLED: false, CODE_RUNNER_TIMEOUT_MS: 20_000 };

const REFUSAL = /Code execution is disabled/;

describe('needsRuntime', () => {
  it('is true for exactly the languages that need executing', () => {
    // Listed out so that adding a language to the enum fails here until
    // somebody decides, deliberately, which side of the gate it belongs on.
    const executed = runCodeSchema.shape.language.options.filter(needsRuntime);
    expect(executed).toEqual(['PYTHON', 'JAVASCRIPT', 'TYPESCRIPT', 'JAVA', 'C', 'CPP']);
  });
});

describe('POST /code/run with no runner configured', () => {
  it('still renders a WEB preview', async () => {
    // WEB spawns nothing — the source is handed back for the browser to render
    // in an iframe sandboxed without allow-same-origin.
    const source = '<h1>Profile card</h1><script>document.title = "x"</script>';
    const result = await controller(noRunner).run({ language: 'WEB', source });

    expect(result.previewHtml).toBe(source);
    expect(result.exitCode).toBe(0);
  });

  it('still runs the SQL syntax check', async () => {
    // SQL is a regex over the source, not a query against a real database.
    const result = await controller(noRunner).run({
      language: 'SQL',
      source: 'SELECT name FROM students;',
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/SQL looks valid/);
  });

  it('refuses every language that needs a runtime', () => {
    const gated = runCodeSchema.shape.language.options.filter(needsRuntime);
    expect(gated).not.toHaveLength(0);

    for (const language of gated) {
      // The refusal is thrown synchronously, before executeCode is ever
      // called — nothing is spawned to then be thrown away.
      const run = () => controller(noRunner).run({ language, source: 'print(1)' });
      expect(run).toThrow(ServiceUnavailableException);
      expect(run).toThrow(REFUSAL);
    }
  });
});

describe('POST /code/run with the host runner enabled', () => {
  it('executes a spawning language', async () => {
    // Node is guaranteed present — we are running inside it — so this asserts
    // the gate opens without depending on python3 or gcc being installed.
    const result = await controller(hostRunner).run({
      language: 'JAVASCRIPT',
      source: 'console.log("ran")',
    });

    expect(result.stdout.trim()).toBe('ran');
    expect(result.exitCode).toBe(0);
  });
});

describe('runnerFor', () => {
  it('prefers the off-box runner over spawning on this host', () => {
    // A box that has been given a runner URL must never fall back to running
    // student code beside its own database, whatever CODE_RUN_ENABLED says.
    const target = runnerFor({
      CODE_RUN_ENABLED: true,
      CODE_RUNNER_URL: 'https://runner.example/api',
      CODE_RUNNER_TIMEOUT_MS: 20_000,
    });

    expect(target).toMatchObject({ kind: 'remote', url: 'https://runner.example/api' });
  });

  it('falls back to the host runner only when it is explicitly enabled', () => {
    expect(runnerFor({ CODE_RUN_ENABLED: true, CODE_RUNNER_TIMEOUT_MS: 1 })).toEqual({
      kind: 'host',
    });
    expect(runnerFor({ CODE_RUN_ENABLED: false, CODE_RUNNER_TIMEOUT_MS: 1 })).toEqual({
      kind: 'none',
    });
  });
});

describe('POST /code/run with an off-box runner', () => {
  const remoteEnv = {
    CODE_RUN_ENABLED: false,
    CODE_RUNNER_URL: 'https://runner.example/api',
    CODE_RUNNER_TIMEOUT_MS: 20_000,
  };

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('runs Java even though the host has no JDK and CODE_RUN_ENABLED is off', async () => {
    // This is the production case: the VPS has no javac at all, so the only
    // way a Java lab works is by executing somewhere else.
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) =>
      Response.json({ stdout: 'sum=5\n', status: { id: 3, description: 'Accepted' } }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await controller(remoteEnv).run({
      language: 'JAVA',
      source: 'public class Main {}',
      stdin: '2 3',
    });

    expect(result.stdout).toBe('sum=5\n');
    expect(result.exitCode).toBe(0);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('https://runner.example/api/submissions');
    // JDK 17 — the id must travel, or every language would run as whatever
    // the runner defaults to.
    expect(JSON.parse(String(init.body))).toMatchObject({ language_id: 91, stdin: '2 3' });
  });

  it('never reaches the network for WEB or SQL', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await controller(remoteEnv).run({ language: 'WEB', source: '<h1>hi</h1>' });
    await controller(remoteEnv).run({ language: 'SQL', source: 'SELECT 1;' });

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
