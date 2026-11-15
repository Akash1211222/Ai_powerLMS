/**
 * Reads the three places a commit passes through on its way to production:
 * this working tree, GitHub Actions, and the VPS.
 *
 * Everything here is read-only by construction — `git` queries that do not
 * move HEAD, `gh api` GETs, and a fixed list of SSH probes. The console must
 * never be the thing that changes production; it exists to say what is true.
 *
 * Every collector answers with a shape that includes `ok` and, when it cannot
 * tell, `reason`. "Unknown" and "broken" look different in the UI on purpose:
 * a missing gh login is not an outage.
 */

import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);

export function repoRoot() {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd: dirname(fileURLToPath(import.meta.url)),
      encoding: 'utf8',
    }).trim();
  } catch {
    return resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
  }
}

const ROOT = repoRoot();
const REPO = process.env.PIPELINE_REPO ?? 'Akash1211222/Ai_powerLMS';
const VPS = process.env.PIPELINE_VPS ?? 'root@88.222.244.192';
const VPS_ROOT = process.env.PIPELINE_VPS_ROOT ?? '/opt/fca-lms';
const BRANCH = process.env.PIPELINE_BRANCH ?? 'main';

function git(args) {
  try {
    return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

/** The working tree as it stands: what you would be pushing. */
export function gitSnapshot() {
  const status = git(['status', '--porcelain']);
  return {
    sha: git(['rev-parse', 'HEAD']) || '0000000',
    shortSha: git(['rev-parse', '--short', 'HEAD']),
    branch: git(['rev-parse', '--abbrev-ref', 'HEAD']),
    subject: git(['log', '-1', '--format=%s']),
    author: git(['log', '-1', '--format=%an']),
    committedAt: git(['log', '-1', '--format=%cI']),
    dirty: status ? status.split('\n').filter(Boolean).length : 0,
    ahead: Number(git(['rev-list', '--count', `origin/${BRANCH}..HEAD`]) || 0),
    behind: Number(git(['rev-list', '--count', `HEAD..origin/${BRANCH}`]) || 0),
    originSha: git(['rev-parse', `origin/${BRANCH}`]),
  };
}

/**
 * The CI run for a commit, with the failing step named.
 *
 * Uses the gh CLI rather than a bare token: it is already authenticated on
 * this machine, and nothing here should ask the user for a second credential.
 */
export async function githubRun(sha) {
  const gh = async (args) => {
    const { stdout } = await run('gh', args, { cwd: ROOT, maxBuffer: 16 * 1024 * 1024 });
    return stdout;
  };
  try {
    const list = JSON.parse(
      await gh([
        'run',
        'list',
        '--repo',
        REPO,
        '--workflow',
        'ci.yml',
        '--limit',
        '8',
        '--json',
        'databaseId,headSha,headBranch,status,conclusion,createdAt,updatedAt,displayTitle,url',
      ]),
    );
    if (!list.length) return { ok: true, state: 'none', runs: [] };

    const match = (sha && list.find((r) => r.headSha === sha)) || list[0];
    let jobs = [];
    try {
      const detail = JSON.parse(
        await gh(['run', 'view', String(match.databaseId), '--repo', REPO, '--json', 'jobs']),
      );
      jobs = (detail.jobs ?? []).map((j) => ({
        name: j.name,
        status: j.status,
        conclusion: j.conclusion,
        startedAt: j.startedAt,
        completedAt: j.completedAt,
        url: j.url,
        failedStep: (j.steps ?? []).find((s) => s.conclusion === 'failure')?.name ?? null,
        steps: (j.steps ?? []).map((s) => ({
          name: s.name,
          conclusion: s.conclusion,
          number: s.number,
        })),
      }));
    } catch {
      // A run that is still queued has no jobs yet; not an error.
    }

    return {
      ok: true,
      state: 'ready',
      forCommit: match.headSha === sha,
      run: { ...match, jobs },
      runs: list.slice(0, 8),
    };
  } catch (err) {
    const msg = String(err.stderr ?? err.message ?? err);
    return {
      ok: false,
      reason: /gh auth login|not logged|authentication/i.test(msg)
        ? 'GitHub CLI is not logged in — run: gh auth login'
        : /not found|command not found|ENOENT/i.test(msg)
          ? 'GitHub CLI (gh) is not installed'
          : msg.trim().split('\n')[0].slice(0, 200),
    };
  }
}

/** The failing step's log, trimmed to the part that matters. */
export async function githubFailureLog(runId) {
  try {
    const { stdout } = await run(
      'gh',
      ['run', 'view', String(runId), '--repo', REPO, '--log-failed'],
      {
        cwd: ROOT,
        maxBuffer: 32 * 1024 * 1024,
      },
    );
    const lines = stdout.split('\n').filter(Boolean);
    return { ok: true, log: lines.slice(-200).join('\n') };
  } catch (err) {
    // While a run is still going, GitHub refuses the log rather than streaming.
    const msg = String(err.stderr ?? err.message ?? '');
    return {
      ok: false,
      reason: /in progress/i.test(msg) ? 'Run still in progress' : msg.slice(0, 200),
    };
  }
}

/**
 * One SSH round-trip for the whole server picture.
 *
 * Deliberately a single fixed script rather than a command the UI can supply:
 * the console holds a root session, and the only safe shape for that is a
 * closed set of reads nobody can extend from the browser.
 */
const VPS_PROBE = `
set +e
echo "SHA=$(git -C ${VPS_ROOT} rev-parse HEAD 2>/dev/null)"
echo "SUBJECT=$(git -C ${VPS_ROOT} log -1 --format=%s 2>/dev/null)"
echo "DEPLOYED_AT=$(git -C ${VPS_ROOT} log -1 --format=%cI 2>/dev/null)"
echo "TIMER=$(systemctl is-active fca-lms-deploy.timer 2>/dev/null)"
echo "NEXT=$(systemctl list-timers fca-lms-deploy --no-pager 2>/dev/null | sed -n 2p | awk '{print $1" "$2" "$3}')"
echo "LOAD=$(cut -d' ' -f1-3 /proc/loadavg)"
echo "MEM=$(free -m | awk '/^Mem:/{print $3"/"$2}')"
echo "DISK=$(df -h / | awk 'NR==2{print $5}')"
echo "---PM2---"
pm2 jlist 2>/dev/null
echo "---LOG---"
journalctl -u fca-lms-deploy -n 40 --no-pager -o short-iso 2>/dev/null | tail -40
`;

export async function vpsState() {
  try {
    const { stdout } = await run(
      'ssh',
      ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=8', VPS, VPS_PROBE],
      { maxBuffer: 8 * 1024 * 1024, timeout: 25_000 },
    );
    const [head, rest = ''] = stdout.split('---PM2---');
    const [pm2Raw, logRaw = ''] = rest.split('---LOG---');

    const kv = {};
    for (const line of head.split('\n')) {
      const m = /^([A-Z_]+)=(.*)$/.exec(line);
      if (m) kv[m[1]] = m[2].trim();
    }

    let processes = [];
    try {
      processes = JSON.parse(pm2Raw.trim()).map((p) => ({
        name: p.name,
        status: p.pm2_env?.status,
        restarts: p.pm2_env?.restart_time ?? 0,
        uptime: p.pm2_env?.pm_uptime ?? null,
        cpu: p.monit?.cpu ?? 0,
        memory: p.monit?.memory ?? 0,
        // The landing page and the legacy API share this box. The deploy is
        // scoped to fca-lms-*; showing the others is how you see it stayed so.
        ours: String(p.name).startsWith('fca-lms-'),
      }));
    } catch {
      processes = [];
    }

    const log = logRaw.trim().split('\n').filter(Boolean);
    return {
      ok: true,
      host: VPS.replace(/^.*@/, ''),
      sha: kv.SHA ?? '',
      shortSha: (kv.SHA ?? '').slice(0, 7),
      subject: kv.SUBJECT ?? '',
      deployedAt: kv.DEPLOYED_AT ?? '',
      timer: kv.TIMER ?? 'unknown',
      nextPoll: kv.NEXT ?? '',
      load: kv.LOAD ?? '',
      mem: kv.MEM ?? '',
      disk: kv.DISK ?? '',
      processes,
      log,
      lastDeployFailed: log.some((l) => /DEPLOY FAILED|CI FAILED/.test(l)),
    };
  } catch (err) {
    const msg = String(err.stderr ?? err.message ?? err);
    return {
      ok: false,
      host: VPS.replace(/^.*@/, ''),
      reason: /Permission denied|publickey/i.test(msg)
        ? 'SSH key not accepted by the server'
        : /timed out|Connection refused|No route/i.test(msg)
          ? 'Server unreachable from here'
          : msg.trim().split('\n')[0].slice(0, 200),
    };
  }
}

/** What the outside world sees, independent of anything SSH says. */
export async function publicHealth() {
  const probe = async (name, url) => {
    const started = Date.now();
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      const body = await res.text();
      let detail = null;
      try {
        const json = JSON.parse(body);
        detail = json.info ?? json.details ?? null;
      } catch {
        // A web page, not JSON. The status code is the whole answer.
      }
      return { name, url, ok: res.ok, status: res.status, ms: Date.now() - started, detail };
    } catch (err) {
      return {
        name,
        url,
        ok: false,
        status: 0,
        ms: Date.now() - started,
        error: String(err.message ?? err),
      };
    }
  };
  return Promise.all([
    probe('LMS web', 'https://lms.futurecorpacademy.in'),
    probe('LMS API', 'https://lms-api.futurecorpacademy.in/health/ready'),
    probe('Landing', 'https://futurecorpacademy.in'),
  ]);
}

export const config = { REPO, VPS, VPS_ROOT, BRANCH, ROOT };
