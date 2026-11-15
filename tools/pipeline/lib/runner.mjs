/**
 * Runs the local pipeline and records what happened.
 *
 * Every run lands in .pipeline/runs/<id>/ as run.json plus one log per stage,
 * so a failure is still there to look at after the terminal is gone — which is
 * the difference between a dashboard and a scrollback buffer.
 *
 * Stages run in order and stop at the first failure, like CI. There is no
 * point building code that does not typecheck, and a wall of consequent errors
 * buries the one that matters.
 */

import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { logTail, parseFailures, stripAnsi } from './parse.mjs';
import { stagesFor } from './stages.mjs';
import { gitSnapshot, repoRoot } from './collect.mjs';

const ROOT = repoRoot();
const RUNS_DIR = join(ROOT, '.pipeline', 'runs');

export const bus = new EventEmitter();

function runDir(id) {
  return join(RUNS_DIR, id);
}

function save(run) {
  mkdirSync(runDir(run.id), { recursive: true });
  writeFileSync(join(runDir(run.id), 'run.json'), JSON.stringify(run, null, 2));
}

function emit(run, event) {
  bus.emit('event', { runId: run.id, ...event });
}

/**
 * The environment stages run in.
 *
 * The repo's own dev scripts load .env through dotenv-cli, but `pnpm test` and
 * `pnpm build` do not, and the integration suite needs TEST_DATABASE_URL —
 * which Turbo strips anyway. So .env is read here and merged in, exactly as
 * AGENTS.md tells a human to do with `set -a; . ./.env`.
 */
function stageEnv() {
  const env = { ...process.env };
  const file = join(ROOT, '.env');
  if (existsSync(file)) {
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
      if (!m) continue;
      let v = m[2].trim().replace(/\s+#.*$/, '');
      if (/^(['"]).*\1$/.test(v)) v = v.slice(1, -1);
      // A real environment variable wins: it is the more deliberate of the two.
      if (env[m[1]] === undefined) env[m[1]] = v;
    }
  }
  if (!env.TEST_DATABASE_URL && env.DATABASE_URL) {
    env.TEST_DATABASE_URL = env.DATABASE_URL.replace(/\/fca\?/, '/fca_test?');
  }
  env.FORCE_COLOR = '0';
  env.CI = '1';
  return env;
}

function execStage(stage, env, onChunk) {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(stage.cmd[0], stage.cmd.slice(1), {
      cwd: ROOT,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    const take = (buf) => {
      const text = buf.toString();
      output += text;
      onChunk(stripAnsi(text));
    };
    child.stdout.on('data', take);
    child.stderr.on('data', take);
    child.on('error', (err) => {
      output += `\n${stage.cmd[0]}: ${err.message}\n`;
      resolve({ code: 127, output, ms: Date.now() - started });
    });
    child.on('close', (code) => resolve({ code: code ?? 1, output, ms: Date.now() - started }));
  });
}

/** Runs `profile` end to end. Resolves with the finished run record. */
export async function runPipeline({ profile = 'quality', trigger = 'manual' } = {}) {
  const git = gitSnapshot();
  const id = `${new Date().toISOString().replace(/[:.]/g, '-')}-${git.sha.slice(0, 7)}`;
  const stages = stagesFor(profile);

  const run = {
    id,
    profile,
    trigger,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    status: 'running',
    git,
    stages: stages.map((s) => ({
      id: s.id,
      name: s.name,
      ciJob: s.ciJob,
      hint: s.hint,
      status: 'pending',
      ms: 0,
      failures: [],
      tail: '',
    })),
  };
  save(run);
  emit(run, { type: 'run:start', run });

  for (const stage of stages) {
    const record = run.stages.find((s) => s.id === stage.id);
    record.status = 'running';
    record.startedAt = new Date().toISOString();
    emit(run, { type: 'stage:start', stageId: stage.id });

    const { code, output, ms } = await execStage(stage, stageEnv(), (chunk) =>
      emit(run, { type: 'stage:log', stageId: stage.id, chunk }),
    );
    writeFileSync(join(runDir(id), `${stage.id}.log`), stripAnsi(output));

    record.ms = ms;
    record.status = code === 0 ? 'passed' : 'failed';
    record.exitCode = code;
    if (code !== 0) {
      record.failures = parseFailures(stage, output, ROOT);
      record.tail = logTail(output);
    }
    emit(run, { type: 'stage:end', stageId: stage.id, stage: record });

    if (code !== 0) {
      for (const later of run.stages) {
        if (later.status === 'pending') later.status = 'skipped';
      }
      run.status = 'failed';
      break;
    }
  }

  if (run.status === 'running') run.status = 'passed';
  run.finishedAt = new Date().toISOString();
  save(run);
  emit(run, { type: 'run:end', run });
  return run;
}

export function listRuns(limit = 25) {
  if (!existsSync(RUNS_DIR)) return [];
  return readdirSync(RUNS_DIR)
    .sort()
    .reverse()
    .slice(0, limit)
    .map((id) => {
      try {
        return JSON.parse(readFileSync(join(RUNS_DIR, id, 'run.json'), 'utf8'));
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

export function readRun(id) {
  try {
    return JSON.parse(readFileSync(join(runDir(id), 'run.json'), 'utf8'));
  } catch {
    return null;
  }
}

export function readStageLog(id, stageId) {
  try {
    return readFileSync(join(runDir(id), `${stageId}.log`), 'utf8');
  } catch {
    return '';
  }
}
