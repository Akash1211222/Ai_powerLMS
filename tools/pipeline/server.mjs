/**
 * The console's HTTP server: a local, zero-dependency Node server.
 *
 * Bound to 127.0.0.1 and nothing else. It can start builds and holds a root
 * SSH session to the VPS, so a port on 0.0.0.0 would hand both to anything on
 * the same café wifi.
 */

import { createReadStream, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import {
  config,
  githubFailureLog,
  githubRun,
  gitSnapshot,
  publicHealth,
  vpsState,
} from './lib/collect.mjs';
import { bus, listRuns, readRun, readStageLog, runPipeline } from './lib/runner.mjs';
import { STAGES } from './lib/stages.mjs';

const PUBLIC = join(import.meta.dirname, 'public');
const PORT = Number(process.env.PIPELINE_PORT ?? 7420);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
};

let running = null;

/** Remote state is polled, not fetched per request: SSH is slow and serial. */
const cache = { github: null, vps: null, health: null, at: 0 };

async function refreshRemote(force = false) {
  if (!force && Date.now() - cache.at < 15_000) return;
  cache.at = Date.now();
  const git = gitSnapshot();
  const [github, vps, health] = await Promise.all([
    githubRun(git.originSha || git.sha),
    vpsState(),
    publicHealth(),
  ]);
  cache.github = github;
  cache.vps = vps;
  cache.health = health;
  bus.emit('event', { type: 'remote', github, vps, health, git });
}

function json(res, body, status = 200) {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(text),
  });
  res.end(text);
}

function serveStatic(res, pathname) {
  const file = join(PUBLIC, normalize(pathname === '/' ? '/index.html' : pathname));
  if (!file.startsWith(PUBLIC) || !existsSync(file)) {
    res.writeHead(404).end('Not found');
    return;
  }
  res.writeHead(200, {
    'Content-Type': MIME[extname(file)] ?? 'application/octet-stream',
    'Cache-Control': 'no-store',
  });
  createReadStream(file).pipe(res);
}

/** Opens a file at a line in the user's editor — the point of every drill-down. */
function openInEditor(file, line) {
  const abs = resolve(config.ROOT, file);
  if (!abs.startsWith(config.ROOT) || !existsSync(abs)) return false;
  const target = `${abs}:${line ?? 1}`;
  // -g is "goto file:line" and is understood by VS Code, Cursor and Windsurf.
  for (const [cmd, args] of [
    ['cursor', ['-g', target]],
    ['code', ['-g', target]],
    ['open', ['-R', abs]],
  ]) {
    try {
      execFile(cmd, args, () => undefined);
      return true;
    } catch {
      // Try the next editor.
    }
  }
  return false;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const path = url.pathname;

  try {
    if (path === '/api/state') {
      await refreshRemote();
      return json(res, {
        git: gitSnapshot(),
        stages: STAGES,
        runs: listRuns(20),
        active: running ? running.id : null,
        github: cache.github,
        vps: cache.vps,
        health: cache.health,
        config: { repo: config.REPO, vps: config.VPS, branch: config.BRANCH },
      });
    }

    if (path === '/api/events') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });
      res.write('retry: 2000\n\n');
      const send = (event) => res.write(`data: ${JSON.stringify(event)}\n\n`);
      bus.on('event', send);
      // Proxies and laptops sleeping mid-stream both close a quiet connection.
      const beat = setInterval(() => res.write(': ping\n\n'), 20_000);
      req.on('close', () => {
        clearInterval(beat);
        bus.off('event', send);
      });
      return undefined;
    }

    if (path === '/api/run' && req.method === 'POST') {
      if (running) return json(res, { error: 'A run is already in progress' }, 409);
      const profile = url.searchParams.get('profile') ?? 'quality';
      running = { id: 'starting' };
      json(res, { started: true, profile });
      runPipeline({ profile, trigger: 'console' })
        .catch((err) => bus.emit('event', { type: 'error', message: String(err.message ?? err) }))
        .finally(() => {
          running = null;
          void refreshRemote(true);
        });
      return undefined;
    }

    if (path.startsWith('/api/run/')) {
      const [, , , id, what, stageId] = path.split('/');
      const run = readRun(id);
      if (!run) return json(res, { error: 'No such run' }, 404);
      if (what === 'log') return json(res, { log: readStageLog(id, stageId) });
      return json(res, run);
    }

    if (path === '/api/github/log') {
      const runId = url.searchParams.get('run');
      return json(res, await githubFailureLog(runId));
    }

    if (path === '/api/refresh' && req.method === 'POST') {
      await refreshRemote(true);
      return json(res, { ok: true });
    }

    if (path === '/api/open' && req.method === 'POST') {
      const file = url.searchParams.get('file');
      const line = Number(url.searchParams.get('line') ?? 1);
      return json(res, { opened: openInEditor(file, line) });
    }

    return serveStatic(res, path);
  } catch (err) {
    return json(res, { error: String(err.message ?? err) }, 500);
  }
});

export function start() {
  server.listen(PORT, '127.0.0.1', () => {
    const url = `http://localhost:${PORT}`;
    console.log(`\n  FutureCorp delivery console → ${url}\n`);
    void refreshRemote(true);
    setInterval(() => void refreshRemote(true), 30_000).unref?.();
    execFile('open', [url], () => undefined);
  });
  return server;
}
