#!/usr/bin/env node
/**
 * FutureCorp delivery console.
 *
 *   node tools/pipeline/cli.mjs ui            open the dashboard
 *   node tools/pipeline/cli.mjs run [--full]  run the pipeline in this terminal
 *   node tools/pipeline/cli.mjs gate          what the pre-push hook runs
 *
 * `run` and `gate` are the same pipeline; gate is quieter and prints the one
 * thing a blocked push needs — where it broke.
 */

import { bus, runPipeline } from './lib/runner.mjs';

const [, , command = 'ui', ...rest] = process.argv;
const profile = rest.includes('--full') ? 'full' : 'quality';
const quiet = rest.includes('--quiet') || command === 'gate';

const C = {
  dim: (s) => `\u001b[2m${s}\u001b[0m`,
  red: (s) => `\u001b[31m${s}\u001b[0m`,
  green: (s) => `\u001b[32m${s}\u001b[0m`,
  yellow: (s) => `\u001b[33m${s}\u001b[0m`,
  bold: (s) => `\u001b[1m${s}\u001b[0m`,
};

function reportFailure(run) {
  const failed = run.stages.find((s) => s.status === 'failed');
  if (!failed) return;
  console.log(
    `\n${C.red('✗')} ${C.bold(failed.name)} failed — mirrors the CI "${failed.ciJob}" job`,
  );
  if (failed.hint) console.log(`  ${C.dim(failed.hint)}`);

  if (failed.failures.length) {
    console.log('');
    for (const f of failed.failures.slice(0, 10)) {
      console.log(`  ${C.bold(`${f.file}:${f.line}:${f.col}`)}  ${f.message}`);
      const hit = f.excerpt?.find((e) => e.hit);
      if (hit)
        console.log(`      ${C.dim(String(hit.n).padStart(4))} │ ${hit.text.trim().slice(0, 110)}`);
    }
    if (failed.failures.length > 10) {
      console.log(C.dim(`  …and ${failed.failures.length - 10} more`));
    }
  } else if (failed.tail) {
    console.log(`\n${C.dim(failed.tail.split('\n').slice(-15).join('\n'))}`);
  }
  console.log(`\n  See it laid out:  ${C.bold('pnpm pipeline:ui')}\n`);
}

if (command === 'ui') {
  const { start } = await import('./server.mjs');
  start();
} else if (command === 'run' || command === 'gate') {
  const started = Date.now();
  if (!quiet) console.log(`\n  Pipeline · ${profile} profile\n`);

  bus.on('event', (e) => {
    if (e.type === 'stage:start' && !quiet) process.stdout.write(`  ${C.dim('●')} ${e.stageId}…`);
    if (e.type === 'stage:end') {
      const s = e.stage;
      const mark = s.status === 'passed' ? C.green('✓') : C.red('✗');
      const line = `  ${mark} ${s.name} ${C.dim(`${(s.ms / 1000).toFixed(1)}s`)}`;
      if (quiet) console.log(line);
      else process.stdout.write(`\r\u001b[K${line}\n`);
    }
  });

  const run = await runPipeline({ profile, trigger: command === 'gate' ? 'pre-push' : 'cli' });
  const secs = ((Date.now() - started) / 1000).toFixed(1);

  if (run.status === 'passed') {
    console.log(
      `\n${C.green('✓')} Pipeline passed in ${secs}s ${C.dim('— same stages CI will run')}\n`,
    );
    process.exit(0);
  }
  reportFailure(run);
  process.exit(1);
} else {
  console.error(`Unknown command: ${command}\nUse: ui | run [--full] | gate`);
  process.exit(2);
}
