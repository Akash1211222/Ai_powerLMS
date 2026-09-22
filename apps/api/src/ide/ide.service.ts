import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { request } from 'node:http';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { SessionEvents } from '../auth/session-events';
import type { Env } from '../config/env';

/**
 * One browser VS Code (code-server) per learner.
 *
 * Every instance is a real code-server process — the same workbench, terminal,
 * debugger and Open VSX extension gallery as desktop VS Code — listening on a
 * unix socket that only this API can reach. The browser never talks to it
 * directly: IdeProxy sits in front and checks an IDE cookie on every request.
 *
 * What this is NOT: a sandbox. In host mode every instance runs as the API's
 * own OS user, so a learner's terminal can read anything that user can,
 * including other learners' workspaces. That is fine on a developer's laptop
 * and not fine on a shared server, which is why IDE_ENABLED defaults to false.
 * See docs/plans/0005-browser-vscode.md for the container launcher that makes
 * it safe to host.
 */
export interface IdeInstance {
  slug: string;
  userId: string;
  socketPath: string;
  process: ChildProcess;
  ready: Promise<void>;
  lastSeen: number;
  /** Open websockets. The workbench holds one for as long as the tab is open. */
  sockets: number;
}

const READY_TIMEOUT_MS = 45_000;
const REAP_INTERVAL_MS = 60_000;

@Injectable()
export class IdeService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(IdeService.name);
  private readonly bySlug = new Map<string, IdeInstance>();
  private readonly byUser = new Map<string, IdeInstance>();
  private reaper?: NodeJS.Timeout;

  constructor(
    private readonly config: ConfigService<Env, true>,
    sessionEvents: SessionEvents,
  ) {
    // Signing out ends the workspace. Its cookie is bound to the instance, so
    // a stopped instance leaves the cookie opening nothing.
    sessionEvents.onLogout((userId) => this.restart(userId));
  }

  get enabled(): boolean {
    return this.config.get('IDE_ENABLED', { infer: true });
  }

  private get dataDir(): string {
    return this.config.get('IDE_DATA_DIR', { infer: true }) ?? join(homedir(), '.fca-ide');
  }

  private get runDir(): string {
    return join(this.dataDir, 'run');
  }

  async onModuleInit(): Promise<void> {
    if (!this.enabled) return;
    await mkdir(this.runDir, { recursive: true });
    await this.killStale();
    this.reaper = setInterval(() => void this.reapIdle(), REAP_INTERVAL_MS);
    this.reaper.unref();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.reaper) clearInterval(this.reaper);
    await Promise.all([...this.bySlug.values()].map((i) => this.stop(i)));
  }

  find(slug: string): IdeInstance | undefined {
    return this.bySlug.get(slug);
  }

  touch(instance: IdeInstance): void {
    instance.lastSeen = Date.now();
  }

  /** The caller's instance, started if it is not already running. */
  async ensure(userId: string): Promise<IdeInstance> {
    const existing = this.byUser.get(userId);
    if (existing && existing.process.exitCode === null) {
      await existing.ready;
      return existing;
    }

    const max = this.config.get('IDE_MAX_INSTANCES', { infer: true });
    if (this.bySlug.size >= max) {
      await this.reapIdle(0);
      if (this.bySlug.size >= max) {
        throw new ServiceUnavailableException(
          'Every code workspace slot is in use right now. Try again in a few minutes.',
        );
      }
    }

    const instance = await this.start(userId);
    await instance.ready;
    return instance;
  }

  async restart(userId: string): Promise<void> {
    const existing = this.byUser.get(userId);
    if (existing) await this.stop(existing);
  }

  private async start(userId: string): Promise<IdeInstance> {
    const slug = randomBytes(12).toString('hex');
    const root = join(this.dataDir, 'users', userId);
    const home = join(root, 'home');
    const workspace = join(home, 'workspace');
    const userData = join(root, 'data');
    const extensions = join(root, 'extensions');
    const socketPath = join(this.runDir, `${slug}.sock`);
    await this.prepare({ home, workspace, userData, extensions });

    const bin = this.config.get('IDE_BINARY', { infer: true });
    const child = spawn(
      bin,
      [
        '--auth',
        'none',
        '--socket',
        socketPath,
        '--socket-mode',
        '600',
        '--user-data-dir',
        userData,
        '--extensions-dir',
        extensions,
        '--abs-proxy-base-path',
        `/ide/${slug}`,
        '--disable-telemetry',
        '--disable-update-check',
        '--disable-workspace-trust',
        '--disable-getting-started-override',
        workspace,
      ],
      { cwd: workspace, env: this.childEnv(home, slug), stdio: ['ignore', 'pipe', 'pipe'] },
    );
    child.stdout?.on('data', () => undefined);
    child.stderr?.on('data', (b) => this.logger.debug(`[${slug}] ${String(b).trim()}`));

    const instance: IdeInstance = {
      slug,
      userId,
      socketPath,
      process: child,
      ready: Promise.resolve(),
      lastSeen: Date.now(),
      sockets: 0,
    };
    instance.ready = this.waitReady(instance);
    // A startup failure is reported to the caller that asked for it; nobody
    // else is waiting, so it must not also surface as an unhandled rejection.
    instance.ready.catch(() => undefined);

    child.on('exit', (code) => {
      this.forget(instance);
      void rm(socketPath, { force: true });
      void rm(`${socketPath}.pid`, { force: true });
      this.logger.log(`IDE ${slug} for ${userId} exited (${code ?? 'signal'})`);
    });
    child.on('error', (err) => this.logger.error(`IDE ${slug} failed to spawn: ${err.message}`));

    this.bySlug.set(slug, instance);
    this.byUser.set(userId, instance);
    if (child.pid) await writeFile(`${socketPath}.pid`, String(child.pid));
    this.logger.log(`IDE ${slug} starting for ${userId}`);
    return instance;
  }

  /**
   * The environment a learner's terminal inherits.
   *
   * Built from nothing rather than copied from ours: the API's environment
   * holds the database URL and the JWT secrets, and `env` in a terminal would
   * print them.
   */
  private childEnv(home: string, slug: string): NodeJS.ProcessEnv {
    const javaHome = process.env.JAVA_HOME;
    const extra = (this.config.get('IDE_EXTRA_PATH', { infer: true }) ?? '')
      .split(':')
      .filter(Boolean);
    const path = [
      dirname(process.execPath),
      ...(javaHome ? [join(javaHome, 'bin')] : []),
      ...extra,
      '/opt/homebrew/bin',
      '/usr/local/bin',
      '/usr/bin',
      '/bin',
      '/usr/sbin',
      '/sbin',
    ];
    return {
      HOME: home,
      PATH: [...new Set(path)].join(':'),
      SHELL: process.env.SHELL ?? '/bin/bash',
      LANG: process.env.LANG ?? 'en_US.UTF-8',
      TMPDIR: join(home, '.tmp'),
      ...(javaHome ? { JAVA_HOME: javaHome } : {}),
      // Where a dev server must mount itself to be previewable through the
      // proxy, e.g. `vite --base "$FCA_PREVIEW_BASE/5173/"`.
      FCA_PREVIEW_BASE: `/ide/${slug}/absproxy`,
    };
  }

  private async prepare(dirs: {
    home: string;
    workspace: string;
    userData: string;
    extensions: string;
  }): Promise<void> {
    const firstRun = !existsSync(dirs.workspace);
    await mkdir(dirs.workspace, { recursive: true });
    await mkdir(join(dirs.home, '.tmp'), { recursive: true });
    await mkdir(join(dirs.userData, 'User'), { recursive: true });

    // Extensions installed once by `pnpm ide:setup` are copied in on first use
    // so a new learner opens a workbench that already speaks every language.
    const template = join(this.dataDir, 'template', 'extensions');
    if (!existsSync(dirs.extensions) && existsSync(template)) {
      await cp(template, dirs.extensions, { recursive: true });
    }
    await mkdir(dirs.extensions, { recursive: true });

    const settings = join(dirs.userData, 'User', 'settings.json');
    if (!existsSync(settings)) {
      await writeFile(settings, JSON.stringify(DEFAULT_SETTINGS, null, 2));
    }
    if (firstRun) {
      await writeFile(join(dirs.workspace, 'README.md'), WELCOME_README);
    }
  }

  private waitReady(instance: IdeInstance): Promise<void> {
    const deadline = Date.now() + READY_TIMEOUT_MS;
    return new Promise<void>((resolve, reject) => {
      const attempt = () => {
        if (instance.process.exitCode !== null) {
          reject(new ServiceUnavailableException('The code workspace failed to start.'));
          return;
        }
        const req = request(
          { socketPath: instance.socketPath, path: '/healthz', method: 'GET' },
          (res) => {
            res.resume();
            if ((res.statusCode ?? 500) < 500) resolve();
            else retry();
          },
        );
        req.on('error', retry);
        req.end();
      };
      const retry = () => {
        if (Date.now() > deadline) {
          reject(new ServiceUnavailableException('The code workspace took too long to start.'));
          return;
        }
        setTimeout(attempt, 250);
      };
      attempt();
    });
  }

  /** Stop instances with no open tab that have been quiet for the idle window. */
  private async reapIdle(idleMs = this.config.get('IDE_IDLE_MINUTES', { infer: true }) * 60_000) {
    const now = Date.now();
    const idle = [...this.bySlug.values()].filter(
      (i) => i.sockets === 0 && now - i.lastSeen >= idleMs,
    );
    await Promise.all(idle.map((i) => this.stop(i)));
  }

  private stop(instance: IdeInstance): Promise<void> {
    this.forget(instance);
    if (instance.process.exitCode !== null) return Promise.resolve();
    return new Promise((resolve) => {
      const kill = setTimeout(() => instance.process.kill('SIGKILL'), 5_000);
      instance.process.once('exit', () => {
        clearTimeout(kill);
        resolve();
      });
      instance.process.kill('SIGTERM');
    });
  }

  private forget(instance: IdeInstance): void {
    if (this.bySlug.get(instance.slug) === instance) this.bySlug.delete(instance.slug);
    if (this.byUser.get(instance.userId) === instance) this.byUser.delete(instance.userId);
  }

  /**
   * Instances left behind by an API that died without shutting down (a
   * SIGKILL, or `node --watch` in dev) still hold memory; their sockets are
   * unreachable because nothing maps a slug to them any more.
   */
  private async killStale(): Promise<void> {
    for (const name of await readdir(this.runDir)) {
      const file = join(this.runDir, name);
      if (name.endsWith('.pid')) {
        const pid = Number(await readFile(file, 'utf8').catch(() => ''));
        if (pid > 0) {
          try {
            process.kill(pid, 'SIGTERM');
          } catch {
            // Already gone.
          }
        }
      }
      await rm(file, { force: true });
    }
  }
}

const DEFAULT_SETTINGS = {
  'workbench.colorTheme': 'Default Dark Modern',
  'workbench.startupEditor': 'readme',
  'telemetry.telemetryLevel': 'off',
  'files.autoSave': 'afterDelay',
  'editor.fontSize': 14,
  'editor.formatOnSave': true,
  'editor.minimap.enabled': true,
  'terminal.integrated.defaultLocation': 'view',
  'security.workspace.trust.enabled': false,
  'python.defaultInterpreterPath': 'python3',
  'clangd.path': 'clangd',
};

const WELCOME_README = `# Your workspace

This is a full VS Code running in your browser. Everything you create here is
saved to your own workspace and is still here next time you open the Code lab.

## Terminal

Open it with **Ctrl + \`** (or *Terminal → New Terminal*). Node, npm, pnpm,
Python, Java, and gcc/g++ are already installed.

## Start a project

\`\`\`bash
# React (Vite)
npm create vite@latest my-app -- --template react
cd my-app && npm install
npm run dev -- --host 127.0.0.1 --base "$FCA_PREVIEW_BASE/5173/"

# Node / Express
mkdir api && cd api && npm init -y && npm install express
node index.js

# Python
python3 -m venv .venv && source .venv/bin/activate
\`\`\`

## See your app running

When a dev server starts, VS Code offers to open it — or open the **Ports** tab
next to the terminal. For Vite, start it with the \`--base\` shown above so its
assets load through the preview link.

## Extensions

Open the Extensions view (**Ctrl + Shift + X**) and install anything from the
Open VSX marketplace — themes, linters, language support, formatters.
`;
