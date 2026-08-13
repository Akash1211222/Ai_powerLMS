import { ServiceUnavailableException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { describe, it, expect } from 'vitest';
import type { Env } from '../config/env';
import { CodeController } from './code.controller';
import { runCodeSchema, spawnsHostProcess } from './code.service';

/**
 * CODE_RUN_ENABLED is off on the shared VPS, and must stay off: turning it on
 * runs untrusted student code beside the database. These specs pin down what
 * the switch is allowed to cost. It should stop compilers being spawned — and
 * nothing else. It used to refuse the whole /code/run endpoint, which killed
 * the HTML/CSS/JS labs on production for no security gain.
 */
const controller = (codeRunEnabled: boolean) =>
  new CodeController({ get: () => codeRunEnabled } as unknown as ConfigService<Env, true>);

const REFUSAL = /Code execution is disabled/;

describe('spawnsHostProcess', () => {
  it('is true for exactly the languages that reach spawn()', () => {
    // Listed out so that adding a language to the enum fails here until
    // somebody decides, deliberately, which side of the gate it belongs on.
    const spawning = runCodeSchema.shape.language.options.filter(spawnsHostProcess);
    expect(spawning).toEqual(['PYTHON', 'JAVASCRIPT', 'TYPESCRIPT', 'JAVA', 'C', 'CPP']);
  });
});

describe('POST /code/run with CODE_RUN_ENABLED off', () => {
  it('still renders a WEB preview', async () => {
    // WEB spawns nothing — the source is handed back for the browser to render
    // in an iframe sandboxed without allow-same-origin.
    const source = '<h1>Profile card</h1><script>document.title = "x"</script>';
    const result = await controller(false).run({ language: 'WEB', source });

    expect(result.previewHtml).toBe(source);
    expect(result.exitCode).toBe(0);
  });

  it('still runs the SQL syntax check', async () => {
    // SQL is a regex over the source, not a query against a real database.
    const result = await controller(false).run({
      language: 'SQL',
      source: 'SELECT name FROM students;',
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/SQL looks valid/);
  });

  it('refuses every language that would spawn a compiler', () => {
    const gated = runCodeSchema.shape.language.options.filter(spawnsHostProcess);
    expect(gated).not.toHaveLength(0);

    for (const language of gated) {
      // The refusal is thrown synchronously, before executeCode is ever
      // called — nothing is spawned to then be thrown away.
      const run = () => controller(false).run({ language, source: 'print(1)' });
      expect(run).toThrow(ServiceUnavailableException);
      expect(run).toThrow(REFUSAL);
    }
  });
});

describe('POST /code/run with CODE_RUN_ENABLED on', () => {
  it('executes a spawning language', async () => {
    // Node is guaranteed present — we are running inside it — so this asserts
    // the gate opens without depending on python3 or gcc being installed.
    const result = await controller(true).run({
      language: 'JAVASCRIPT',
      source: 'console.log("ran")',
    });

    expect(result.stdout.trim()).toBe('ran');
    expect(result.exitCode).toBe(0);
  });
});
