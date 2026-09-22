/**
 * Installs the default extension set once, into the template every new
 * learner's workspace is copied from (see IdeService.prepare).
 *
 * Run:  pnpm ide:setup                 — the default set below
 *       pnpm ide:setup some.extension  — add more (Open VSX ids)
 *
 * Re-running is safe: code-server skips what is already installed. Existing
 * learners keep their own extension folders; this only shapes new ones.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const DEFAULTS = [
  'ms-python.python', // Python: IntelliSense, run, debug, venvs
  'redhat.java', // Java language server
  'vscjava.vscode-java-debug', // Java run/debug
  'llvm-vs-code-extensions.vscode-clangd', // C / C++
  'dbaeumer.vscode-eslint', // JS/TS lint
  'esbenp.prettier-vscode', // Formatting
  'bradlc.vscode-tailwindcss', // Tailwind IntelliSense
  'formulahendry.code-runner', // One-click ▶ Run for any single file
];

const bin = process.env.IDE_BINARY ?? 'code-server';
const dataDir = process.env.IDE_DATA_DIR ?? join(homedir(), '.fca-ide');
const target = join(dataDir, 'template', 'extensions');
mkdirSync(target, { recursive: true });

const ids = [...DEFAULTS, ...process.argv.slice(2)];
let failed = 0;
for (const id of ids) {
  process.stdout.write(`→ ${id} … `);
  const r = spawnSync(bin, ['--extensions-dir', target, '--install-extension', id], {
    encoding: 'utf8',
  });
  if (r.status === 0) console.log('ok');
  else {
    failed += 1;
    console.log(`failed\n${(r.stderr || r.stdout || r.error?.message || '').trim()}`);
  }
}
console.log(`\nTemplate: ${target}${failed ? ` — ${failed} failed` : ''}`);
process.exit(failed ? 1 : 0);
