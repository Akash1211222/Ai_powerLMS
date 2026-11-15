/**
 * Turns tool output into located failures: {file, line, col, message}.
 *
 * This is the part that answers "where exactly did it break". Every tool in
 * this repo reports differently, and reading a 2000-line log to find one
 * `page.tsx(41,7)` is the job being automated here.
 *
 * Each parser is deliberately forgiving: an unrecognised line is dropped, not
 * guessed at. A wrong file:line is worse than none — it sends you to edit code
 * that was never broken. When nothing is recognised the console falls back to
 * showing the log tail, which is still the truth.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';

const ANSI = /\u001b\[[0-9;]*m/g;
export const stripAnsi = (s) => s.replace(ANSI, '');

/**
 * Turbo runs every task from inside its own workspace, prefixes each line with
 * `@fca/web:typecheck: `, and the tool underneath reports paths relative to
 * *that* package — so `src/lib/ide-api.ts` in the log is `apps/web/src/lib/...`
 * on disk. Without undoing both, every location parsed from a monorepo build
 * points at a file that does not exist, and the console silently finds nothing.
 */
let packageDirs = null;

function workspaceDirs(root) {
  if (packageDirs) return packageDirs;
  packageDirs = new Map();
  for (const group of ['apps', 'packages', 'tools']) {
    const base = join(root, group);
    if (!existsSync(base)) continue;
    for (const entry of readdirSync(base)) {
      try {
        const pkg = JSON.parse(readFileSync(join(base, entry, 'package.json'), 'utf8'));
        if (pkg.name) packageDirs.set(pkg.name, join(group, entry));
      } catch {
        // Not a workspace package.
      }
    }
  }
  return packageDirs;
}

const TURBO_PREFIX = /^(@?[\w@/.-]+):([\w:-]+):\s?/;

/**
 * Log lines, each carrying the directory its relative paths resolve against.
 * Outside Turbo that is the repo root, which is what a plain `tsc` reports.
 */
function contextLines(text, root) {
  const dirs = workspaceDirs(root);
  return text.split('\n').map((line) => {
    const m = TURBO_PREFIX.exec(line);
    if (!m) return { text: line, base: root };
    const dir = dirs.get(m[1]);
    return { text: line.slice(m[0].length), base: dir ? resolve(root, dir) : root };
  });
}

/**
 * Repo-relative path for a location, or null.
 *
 * Only paths that exist are kept: it is the cheapest guard against a bad
 * guess, and a wrong file:line sends you to edit code that was never broken.
 * Tried against the reporting package first, then the repo root, because some
 * tools print repo-relative paths even when Turbo ran them.
 */
function locate(file, base, root) {
  if (!file) return null;
  const clean = file.replace(/^\.\//, '').trim();
  for (const abs of [
    isAbsolute(clean) ? clean : resolve(base, clean),
    isAbsolute(clean) ? null : resolve(root, clean),
  ]) {
    if (!abs) continue;
    const r = relative(root, abs);
    if (!r.startsWith('..') && existsSync(abs)) return r;
  }
  return null;
}

/** tsc: `src/a.ts(12,5): error TS2345: msg` or `src/a.ts:12:5 - error TS...` */
function parseTsc(lines, root) {
  const out = [];
  for (const { text: line, base } of lines) {
    const m =
      /^(.*?)\((\d+),(\d+)\):\s*(error|warning)\s+(TS\d+):\s*(.*)$/.exec(line) ||
      /^(.*?):(\d+):(\d+)\s*-\s*(error|warning)\s+(TS\d+):\s*(.*)$/.exec(line);
    if (!m) continue;
    const file = locate(m[1], base, root);
    if (!file) continue;
    out.push({
      file,
      line: Number(m[2]),
      col: Number(m[3]),
      severity: m[4],
      code: m[5],
      message: m[6].trim(),
    });
  }
  return out;
}

/** ESLint stylish: a file path on its own line, then `  12:5  error  msg  rule`. */
function parseEslint(lines, root) {
  const out = [];
  let file = null;
  for (const { text: raw, base } of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) continue;
    const head = /^(?:\.\/|\/)?[\w./@-]+\.(?:[cm]?[jt]sx?)$/.exec(line.trim());
    if (head) {
      file = locate(line.trim(), base, root) ?? file;
      continue;
    }
    const m = /^\s*(\d+):(\d+)\s+(error|warning)\s+(.*?)(?:\s\s+([\w@/-]+))?$/.exec(line);
    if (m && file) {
      out.push({
        file,
        line: Number(m[1]),
        col: Number(m[2]),
        severity: m[3],
        code: m[5] ?? 'eslint',
        message: m[4].trim(),
      });
    }
  }
  return out;
}

/**
 * Vitest. The useful location is the first stack frame inside the repo, not
 * the assertion line in vitest's own code, so frames are walked in order and
 * the first one that resolves to a real file in the tree wins.
 */
function parseVitest(lines, root) {
  const out = [];
  for (let i = 0; i < lines.length; i += 1) {
    const base = lines[i].base;
    const fail = /^\s*(?:FAIL|×|✗)\s+(.+?)(?:\s*>\s*(.+))?$/.exec(lines[i].text);
    if (!fail) continue;
    const specPath = fail[1].split(' > ')[0].trim().split(/\s+/)[0];
    const file = locate(specPath, base, root);
    if (!file) continue;

    const testName = fail[2]?.trim() ?? '';
    let error = null;
    let line = null;
    let col = null;
    let frameFile = null;
    // Look ahead for the assertion and the first frame inside the repo.
    for (let j = i + 1; j < Math.min(i + 40, lines.length); j += 1) {
      const l = lines[j].text;
      if (/^\s*(?:FAIL|×|✗|PASS|✓)\s/.test(l)) break;
      const err =
        /^\s*(?:→\s*)?((?:Assertion)?Error|TypeError|ReferenceError|SyntaxError)[:\s](.*)$/.exec(l);
      if (err && !error) error = `${err[1]}: ${err[2].trim()}`;
      const frame =
        /(?:❯|at)\s+(?:.*?\()?((?:\.\/|\/)?[\w./@-]+\.(?:[cm]?[jt]sx?)):(\d+):(\d+)/.exec(l);
      if (frame && line === null) {
        const f = locate(frame[1], lines[j].base, root);
        if (f) {
          line = Number(frame[2]);
          col = Number(frame[3]);
          frameFile = f;
        }
      }
    }

    // The assertion is what went wrong; the test name is only where. Both,
    // because "expected false to be true" alone names nothing.
    const message = error
      ? testName
        ? `${testName} — ${error}`
        : error
      : testName || 'Test failed';

    // The frame can land in the code under test rather than the spec; both are
    // worth offering, with the thrown line first.
    if (frameFile && frameFile !== file) {
      out.push({ file: frameFile, line, col, severity: 'error', code: 'vitest', message });
    }
    out.push({ file, line: line ?? 1, col: col ?? 1, severity: 'error', code: 'vitest', message });
  }
  // One entry per file+line; the look-ahead can report the same spot twice.
  const seen = new Set();
  return out.filter((f) => {
    const k = `${f.file}:${f.line}:${f.message}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Next/webpack: `./src/app/page.tsx` then `Type error: …` a line or two later. */
function parseNext(lines, root) {
  const out = [];
  for (let i = 0; i < lines.length; i += 1) {
    const head = /^\s*\.?\/?([\w./@-]+\.(?:[cm]?[jt]sx?|css|scss))\s*$/.exec(lines[i].text);
    if (!head) continue;
    const file = locate(head[1], lines[i].base, root);
    if (!file) continue;
    for (let j = i + 1; j < Math.min(i + 8, lines.length); j += 1) {
      const m = /^\s*(Type error|Error|Module not found|Syntax error)\s*:\s*(.*)$/.exec(
        lines[j].text,
      );
      if (!m) continue;
      const pos = /^\s*(\d+):(\d+)/.exec(lines[j + 1]?.text ?? '');
      out.push({
        file,
        line: pos ? Number(pos[1]) : 1,
        col: pos ? Number(pos[2]) : 1,
        severity: 'error',
        code: m[1],
        message: m[2].trim(),
      });
      break;
    }
  }
  return out.length ? out : parseTsc(lines, root);
}

/** Last resort: any `path:line:col` that resolves to a file in the tree. */
function parseGeneric(lines, root) {
  const out = [];
  for (const { text: line, base } of lines) {
    const m = /((?:\.\/|\/)?[\w./@-]+\.(?:[cm]?[jt]sx?|prisma|json)):(\d+)(?::(\d+))?/.exec(line);
    if (!m) continue;
    const file = locate(m[1], base, root);
    if (!file) continue;
    out.push({
      file,
      line: Number(m[2]),
      col: m[3] ? Number(m[3]) : 1,
      severity: 'error',
      code: 'error',
      message: line.trim().slice(0, 300),
    });
  }
  return out.slice(0, 20);
}

const PARSERS = {
  tsc: parseTsc,
  eslint: parseEslint,
  vitest: parseVitest,
  next: parseNext,
  generic: parseGeneric,
};

/**
 * Failures for a finished stage, worst first, each with the surrounding source
 * so the console can show the broken line without opening an editor.
 */
export function parseFailures(stage, rawText, root) {
  const lines = contextLines(stripAnsi(rawText), root);
  const parser = PARSERS[stage.parser ?? 'generic'] ?? parseGeneric;
  let found = parser(lines, root);
  if (!found.length && parser !== parseGeneric) found = parseGeneric(lines, root);

  const errors = found.filter((f) => f.severity !== 'warning');
  const chosen = (errors.length ? errors : found).slice(0, 50);
  return chosen.map((f) => ({ ...f, excerpt: excerpt(resolve(root, f.file), f.line) }));
}

/** Three lines either side of the failure, with the line itself marked. */
export function excerpt(absPath, line, radius = 3) {
  try {
    const lines = readFileSync(absPath, 'utf8').split('\n');
    const from = Math.max(1, line - radius);
    const to = Math.min(lines.length, line + radius);
    const rows = [];
    for (let n = from; n <= to; n += 1) {
      rows.push({ n, text: lines[n - 1] ?? '', hit: n === line });
    }
    return rows;
  } catch {
    return [];
  }
}

/** When nothing parsed, the end of the log is still where it went wrong. */
export function logTail(rawText, lines = 40) {
  return stripAnsi(rawText).trimEnd().split('\n').slice(-lines).join('\n');
}
