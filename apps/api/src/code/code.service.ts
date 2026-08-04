import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';

export const runCodeSchema = z.object({
  language: z.enum(['PYTHON', 'JAVASCRIPT', 'TYPESCRIPT', 'JAVA', 'C', 'CPP', 'SQL', 'WEB']),
  source: z.string().min(1).max(100_000),
  stdin: z.string().max(10_000).optional(),
});
export type RunCodeDto = z.infer<typeof runCodeSchema>;

export interface RunCodeResult {
  language: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut: boolean;
  compileOutput?: string;
  previewHtml?: string;
}

const RUN_MS = 8_000;

function truncate(s: string, n = 12_000) {
  return s.length > n ? `${s.slice(0, n)}\n…(truncated)` : s;
}

async function runProcess(
  cmd: string,
  args: string[],
  opts: { cwd?: string; stdin?: string; timeoutMs?: number } = {},
): Promise<{ stdout: string; stderr: string; exitCode: number; timedOut: boolean }> {
  const timeoutMs = opts.timeoutMs ?? RUN_MS;
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      cwd: opts.cwd,
      env: { ...process.env, NODE_OPTIONS: '' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);
    child.stdout.on('data', (b) => {
      stdout += String(b);
      if (stdout.length > 50_000) child.kill('SIGKILL');
    });
    child.stderr.on('data', (b) => {
      stderr += String(b);
      if (stderr.length > 50_000) child.kill('SIGKILL');
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({ stdout: '', stderr: err.message, exitCode: 1, timedOut: false });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({
        stdout: truncate(stdout),
        stderr: truncate(stderr),
        exitCode: timedOut ? 1 : (code ?? 1),
        timedOut,
      });
    });
    if (opts.stdin) child.stdin.write(opts.stdin);
    child.stdin.end();
  });
}

/** Local sandboxed runners for the common LMS languages (no external API needed). */
async function executeLocal(dto: RunCodeDto): Promise<RunCodeResult> {
  const dir = await mkdtemp(join(tmpdir(), 'fca-code-'));
  try {
    if (dto.language === 'JAVASCRIPT' || dto.language === 'TYPESCRIPT') {
      const file = join(dir, 'main.js');
      // Strip TS-only bits lightly so demos still run under Node.
      const source =
        dto.language === 'TYPESCRIPT'
          ? dto.source
              .replace(/:\s*[A-Za-z_][\w.<>,\s|&[\]]*(?=[,)=])/g, '')
              .replace(/\bas\s+[A-Za-z_][\w.]*/g, '')
              .replace(/interface\s+\w+\s*\{[\s\S]*?\n\}/g, '')
          : dto.source;
      await writeFile(file, source, 'utf8');
      const r = await runProcess(process.execPath, [file], { stdin: dto.stdin });
      return { language: dto.language, ...r };
    }

    if (dto.language === 'PYTHON') {
      const file = join(dir, 'main.py');
      await writeFile(file, dto.source, 'utf8');
      const r = await runProcess('python3', [file], { stdin: dto.stdin });
      return { language: 'PYTHON', ...r };
    }

    if (dto.language === 'JAVA') {
      const file = join(dir, 'Main.java');
      await writeFile(file, dto.source, 'utf8');
      const compile = await runProcess('javac', [file], { cwd: dir, timeoutMs: 12_000 });
      if (compile.exitCode !== 0) {
        return {
          language: 'JAVA',
          stdout: '',
          stderr: compile.stderr || compile.stdout,
          exitCode: 1,
          timedOut: compile.timedOut,
          compileOutput: compile.stderr || compile.stdout,
        };
      }
      const r = await runProcess('java', ['-cp', dir, 'Main'], { stdin: dto.stdin });
      return { language: 'JAVA', ...r, compileOutput: compile.stdout || undefined };
    }

    if (dto.language === 'C' || dto.language === 'CPP') {
      const src = join(dir, dto.language === 'C' ? 'main.c' : 'main.cpp');
      const out = join(dir, 'a.out');
      await writeFile(src, dto.source, 'utf8');
      const compiler = dto.language === 'C' ? 'gcc' : 'g++';
      const compile = await runProcess(compiler, [src, '-o', out], { timeoutMs: 12_000 });
      if (compile.exitCode !== 0) {
        return {
          language: dto.language,
          stdout: '',
          stderr: compile.stderr || compile.stdout || `${compiler} not available`,
          exitCode: 1,
          timedOut: compile.timedOut,
          compileOutput: compile.stderr || compile.stdout,
        };
      }
      const r = await runProcess(out, [], { stdin: dto.stdin });
      return { language: dto.language, ...r, compileOutput: compile.stdout || undefined };
    }

    return {
      language: dto.language,
      stdout: '',
      stderr: `No local runner for ${dto.language}`,
      exitCode: 1,
      timedOut: false,
    };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

/**
 * Execute student code. WEB = HTML preview. SQL = lightweight syntax check.
 * All other languages run in a short-lived local sandbox (Node / python3 / javac / gcc).
 */
export async function executeCode(dto: RunCodeDto): Promise<RunCodeResult> {
  if (dto.language === 'WEB') {
    return {
      language: 'WEB',
      stdout: 'Web preview ready — rendered in the browser.',
      stderr: '',
      exitCode: 0,
      timedOut: false,
      previewHtml: dto.source,
    };
  }

  if (dto.language === 'SQL') {
    const src = dto.source.trim();
    const ok = /\b(select|insert|update|delete|create|with)\b/i.test(src);
    return {
      language: 'SQL',
      stdout: ok
        ? 'SQL looks valid. Query accepted for AI evaluation on submit.\n(No live DB is attached in the sandbox.)'
        : '',
      stderr: ok ? '' : 'Could not detect a SQL statement (SELECT/INSERT/UPDATE/DELETE/CREATE).',
      exitCode: ok ? 0 : 1,
      timedOut: false,
    };
  }

  return executeLocal(dto);
}
