/**
 * Parser tests — `node --test tools/pipeline/`.
 *
 * The parser is the one piece that can be confidently wrong: it will happily
 * report a file:line that is not where the break is, and a console that points
 * at innocent code is worse than one that says nothing. These lock in the two
 * ways that happens — Turbo's line prefix, and paths relative to a workspace
 * package rather than the repo — plus the refusal to invent a location.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFailures } from './lib/parse.mjs';
import { repoRoot } from './lib/collect.mjs';

const ROOT = repoRoot();
const stage = (parser) => ({ id: 'x', parser });

test('tsc: resolves a workspace-relative path through the Turbo prefix', () => {
  const log = [
    '@fca/web:typecheck: cache miss, executing 874ae30ef774ed19',
    "@fca/web:typecheck: src/lib/ide-api.ts(9,34): error TS2322: Type 'Promise<IdeStatus>' is not assignable.",
  ].join('\n');

  const [found, ...rest] = parseFailures(stage('tsc'), log, ROOT);
  assert.equal(rest.length, 0);
  assert.equal(found.file, 'apps/web/src/lib/ide-api.ts');
  assert.equal(found.line, 9);
  assert.equal(found.col, 34);
  assert.equal(found.code, 'TS2322');
  assert.match(found.message, /not assignable/);
  // The excerpt is what makes the console readable without opening an editor.
  assert.ok(found.excerpt.some((row) => row.hit && row.n === 9));
});

test('tsc: a path that does not exist is dropped, not guessed at', () => {
  const log = '@fca/web:typecheck: src/does/not/exist.ts(3,1): error TS1005: oops';
  assert.deepEqual(parseFailures(stage('tsc'), log, ROOT), []);
});

test('tsc: plain output with no Turbo prefix still resolves from the repo root', () => {
  const log = 'apps/web/src/lib/ide-api.ts(2,1): error TS2307: Cannot find module.';
  const [found] = parseFailures(stage('tsc'), log, ROOT);
  assert.equal(found.file, 'apps/web/src/lib/ide-api.ts');
  assert.equal(found.line, 2);
});

test('eslint: carries the file heading down to its numbered findings', () => {
  const log = [
    '@fca/web:lint: ',
    '@fca/web:lint: src/lib/ide-api.ts',
    '@fca/web:lint:   3:7  error  Unexpected console statement  no-console',
  ].join('\n');

  const [found] = parseFailures(stage('eslint'), log, ROOT);
  assert.equal(found.file, 'apps/web/src/lib/ide-api.ts');
  assert.equal(found.line, 3);
  assert.equal(found.code, 'no-console');
  assert.equal(found.severity, 'error');
});

test('eslint: warnings yield to errors, which are what fail CI', () => {
  const log = [
    '@fca/web:lint: src/lib/ide-api.ts',
    '@fca/web:lint:   1:1  warning  Something cosmetic  style-rule',
    '@fca/web:lint:   4:2  error    Something fatal     real-rule',
  ].join('\n');

  const found = parseFailures(stage('eslint'), log, ROOT);
  assert.equal(found.length, 1);
  assert.equal(found[0].code, 'real-rule');
});

test('vitest: reports the spec and the first frame inside the repo', () => {
  const log = [
    '@fca/api:test:  FAIL  src/ide/ide.proxy.spec.ts > IdeProxy > accepts only the workbench origin',
    '@fca/api:test: AssertionError: expected false to be true',
    '@fca/api:test:  ❯ node_modules/.pnpm/vitest/dist/chunk.js:120:14',
    '@fca/api:test:  ❯ src/ide/ide.proxy.spec.ts:31:5',
  ].join('\n');

  const found = parseFailures(stage('vitest'), log, ROOT);
  assert.ok(found.length >= 1);
  assert.equal(found[0].file, 'apps/api/src/ide/ide.proxy.spec.ts');
  assert.equal(found[0].line, 31);
  assert.match(found[0].message, /expected false to be true/);
});

test('an unparseable log yields nothing rather than a wrong location', () => {
  const log = 'ELIFECYCLE  Command failed with exit code 2.\n ERROR  run failed';
  assert.deepEqual(parseFailures(stage('tsc'), log, ROOT), []);
});
