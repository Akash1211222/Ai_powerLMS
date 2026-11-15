/**
 * Console UI. Plain modules, no build step — this is a local tool and a
 * toolchain for it would be one more thing to keep working.
 *
 * One rule runs through the whole screen: never show a green state you have
 * not verified. Anything unknown (gh not logged in, SSH down) says so rather
 * than defaulting to a reassuring colour.
 */

const $ = (sel) => document.querySelector(sel);
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
};

const state = {
  git: null,
  stages: [],
  runs: [],
  run: null,
  github: null,
  vps: null,
  health: null,
  config: {},
  selected: null,
  liveLog: new Map(),
};

const ICON = { passed: '✓', failed: '✗', running: '◐', pending: '·', skipped: '–', gap: '◇' };
const fmtMs = (ms) =>
  ms >= 60_000 ? `${(ms / 60_000).toFixed(1)}m` : `${(ms / 1000).toFixed(1)}s`;

function ago(iso) {
  if (!iso) return '—';
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return `${Math.max(0, Math.round(s))}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86_400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86_400)}d ago`;
}

/** GitHub's two fields collapse to one word the rest of the UI understands. */
function ghStatus(job) {
  if (!job) return 'pending';
  if (job.status !== 'completed') return 'running';
  return job.conclusion === 'success'
    ? 'passed'
    : job.conclusion === 'skipped'
      ? 'skipped'
      : 'failed';
}

// ---------------------------------------------------------------- the flow

function laneNode({ status, label, meta, onClick, selected, gap }) {
  const node = el('button', `node ${status}${selected ? ' selected' : ''}${gap ? ' gap' : ''}`);
  node.append(
    el('span', `icon ${gap ? 'gap' : status}`, gap ? ICON.gap : (ICON[status] ?? '·')),
    el('span', 'label', label),
    el('span', 'meta', meta ?? ''),
  );
  if (onClick) node.addEventListener('click', onClick);
  else node.disabled = true;
  return node;
}

function lane(title, stateLabel, stateClass, nodes) {
  const wrap = el('div', 'lane');
  const head = el('div', 'lane-head');
  head.append(el('h3', null, title));
  const s = el('span', `lane-state`, stateLabel);
  s.style.color = `var(--${stateClass})`;
  head.append(s);
  wrap.append(head);
  const list = el('div', 'nodes');
  nodes.forEach((n) => list.append(n));
  wrap.append(list);
  return wrap;
}

function renderFlow() {
  const flow = $('#flow');
  flow.replaceChildren();

  // Lane 1 — this machine.
  const run = state.run;
  const localNodes = (
    run?.stages ?? state.stages.filter((s) => s.profiles?.includes('quality'))
  ).map((s) => {
    const status = run ? s.status : 'pending';
    return laneNode({
      status,
      label: s.name,
      meta: s.ms ? fmtMs(s.ms) : '',
      selected: state.selected?.kind === 'local' && state.selected.id === s.id,
      onClick: () => select({ kind: 'local', id: s.id }),
    });
  });
  const localState = run
    ? run.status === 'running'
      ? ['running', 'warn']
      : run.status === 'passed'
        ? ['passed', 'pass']
        : ['failed', 'fail']
    : ['not run', 'faint'];
  flow.append(lane('1 · This Mac', localState[0], localState[1], localNodes));

  // Lane 2 — the push itself: is what you tested even on the remote?
  const git = state.git ?? {};
  const pushNodes = [
    laneNode({
      status: git.dirty ? 'running' : 'passed',
      label: git.dirty ? `${git.dirty} uncommitted file(s)` : 'Working tree clean',
      meta: '',
      onClick: () => select({ kind: 'git' }),
    }),
    laneNode({
      status: git.ahead ? 'running' : 'passed',
      label: git.ahead ? `${git.ahead} commit(s) not pushed` : 'Pushed to origin',
      meta: git.shortSha ?? '',
      onClick: () => select({ kind: 'git' }),
    }),
  ];
  flow.append(
    lane(
      '2 · Git',
      git.dirty || git.ahead ? 'local only' : 'in sync',
      git.dirty || git.ahead ? 'warn' : 'pass',
      pushNodes,
    ),
  );

  // Lane 3 — GitHub Actions.
  const gh = state.github;
  let ghNodes = [];
  let ghState = ['unknown', 'faint'];
  if (gh?.ok && gh.run) {
    ghNodes = gh.run.jobs.length
      ? gh.run.jobs.map((j) =>
          laneNode({
            status: ghStatus(j),
            label: j.name.replace(/ · /g, ' · '),
            meta: j.failedStep ? 'failed step' : '',
            selected: state.selected?.kind === 'gh' && state.selected.id === j.name,
            onClick: () => select({ kind: 'gh', id: j.name }),
          }),
        )
      : [laneNode({ status: 'running', label: 'Queued — no jobs yet', meta: '' })];
    const concl = gh.run.conclusion;
    ghState =
      gh.run.status !== 'completed'
        ? ['running', 'warn']
        : concl === 'success'
          ? ['passed', 'pass']
          : ['failed', 'fail'];
    if (!gh.forCommit) ghState = [`${ghState[0]} (older commit)`, ghState[1]];
  } else {
    ghNodes = [laneNode({ status: 'pending', label: gh?.reason ?? 'Reading GitHub…', meta: '' })];
  }
  flow.append(lane('3 · GitHub Actions', ghState[0], ghState[1], ghNodes));

  // Lane 4 — the VPS, where it actually has to work.
  const vps = state.vps;
  let depNodes = [];
  let depState = ['unknown', 'faint'];
  if (vps?.ok) {
    const drift = state.git?.originSha && vps.sha && state.git.originSha !== vps.sha;
    depNodes = [
      laneNode({
        status: vps.timer === 'active' ? 'passed' : 'failed',
        label: vps.timer === 'active' ? 'Deploy poller active' : 'Deploy poller stopped',
        meta: vps.nextPoll ? 'next ' + vps.nextPoll.split(' ').slice(-1)[0] : '',
        onClick: () => select({ kind: 'vps' }),
      }),
      laneNode({
        status: vps.lastDeployFailed ? 'failed' : drift ? 'running' : 'passed',
        label: vps.lastDeployFailed ? 'Last deploy failed' : drift ? 'Deploy pending' : 'Deployed',
        meta: vps.shortSha,
        onClick: () => select({ kind: 'vps' }),
      }),
      ...(state.health ?? []).map((h) =>
        laneNode({
          status: h.ok ? 'passed' : 'failed',
          label: h.name,
          meta: h.status ? `${h.status} · ${h.ms}ms` : 'down',
          onClick: () => select({ kind: 'vps' }),
        }),
      ),
    ];
    depState = vps.lastDeployFailed
      ? ['failed', 'fail']
      : drift
        ? ['behind', 'warn']
        : ['live', 'pass'];
  } else {
    depNodes = [laneNode({ status: 'pending', label: vps?.reason ?? 'Reading server…', meta: '' })];
  }
  flow.append(lane('4 · Production', depState[0], depState[1], depNodes));
}

// ------------------------------------------------------------- drill-down

function select(sel) {
  state.selected = sel;
  renderFlow();
  renderDetail();
}

function codeBlock(excerpt) {
  const box = el('div', 'code');
  for (const row of excerpt) {
    const line = el('div', `row${row.hit ? ' hit' : ''}`);
    line.append(el('span', 'n', String(row.n)), el('span', 'c', row.text || ' '));
    box.append(line);
  }
  return box;
}

function failureBlock(f) {
  const wrap = el('div', 'failure');
  const head = el('div', 'failure-head');
  const loc = el('button', 'loc', `${f.file}:${f.line}:${f.col}`);
  loc.title = 'Open in your editor';
  loc.addEventListener('click', () => {
    fetch(`/api/open?file=${encodeURIComponent(f.file)}&line=${f.line}`, { method: 'POST' });
  });
  head.append(loc, el('span', 'rule', f.code ?? ''));
  wrap.append(head, el('div', 'failure-msg', f.message));
  if (f.excerpt?.length) wrap.append(codeBlock(f.excerpt));
  return wrap;
}

function durationBars(stages) {
  const done = stages.filter((s) => s.ms > 0);
  if (!done.length) return null;
  const max = Math.max(...done.map((s) => s.ms));
  const bars = el('div', 'bars');
  for (const s of stages) {
    const row = el('div', 'bar-row');
    const track = el('div', 'bar-track');
    const fill = el('div', `bar-fill ${s.status}`);
    fill.style.width = `${s.ms ? Math.max(2, (s.ms / max) * 100) : 0}%`;
    track.append(fill);
    row.append(
      el('span', 'muted', s.name),
      track,
      el('span', 'mono faint', s.ms ? fmtMs(s.ms) : '—'),
    );
    bars.append(row);
  }
  return bars;
}

async function renderDetail() {
  const box = $('#detail');
  const sel = state.selected;
  box.replaceChildren();

  if (!sel) {
    $('#detail-title').textContent = state.run ? `Run · ${state.run.profile}` : 'Pipeline';
    $('#detail-sub').textContent = state.run
      ? `${state.run.status} · ${ago(state.run.startedAt)}`
      : 'Run the pipeline, or pick a stage above';
    if (state.run) {
      const bars = durationBars(state.run.stages);
      if (bars) box.append(bars);
    } else {
      box.append(
        el(
          'div',
          'empty',
          'Nothing has run on this machine yet. “Run pipeline” executes exactly what CI will.',
        ),
      );
    }
    return;
  }

  if (sel.kind === 'local') {
    const stage = state.run?.stages.find((s) => s.id === sel.id);
    const def = state.stages.find((s) => s.id === sel.id);
    $('#detail-title').textContent = def?.name ?? sel.id;
    $('#detail-sub').textContent = stage
      ? `${stage.status} · ${fmtMs(stage.ms)} · mirrors CI job "${stage.ciJob}"`
      : def?.gap
        ? 'Not run locally'
        : 'Not run yet';

    if (def?.gap) {
      box.append(el('div', 'banner hint', def.gap));
      return;
    }
    if (!stage) {
      box.append(el('div', 'empty', 'This stage has not run yet.'));
      return;
    }
    if (stage.status === 'failed') {
      if (stage.hint) box.append(el('div', 'banner bad', stage.hint));
      if (stage.failures.length) {
        stage.failures.forEach((f) => box.append(failureBlock(f)));
      } else {
        box.append(
          el('div', 'banner hint', 'No file/line could be parsed — the end of the log is below.'),
        );
        box.append(el('pre', 'log', stage.tail));
      }
      return;
    }
    const live = state.liveLog.get(sel.id);
    if (stage.status === 'running' && live) {
      box.append(el('pre', 'log', live.slice(-6000)));
      return;
    }
    const res = await fetch(`/api/run/${state.run.id}/log/${sel.id}`).then((r) => r.json());
    box.append(el('pre', 'log', (res.log || 'No output.').slice(-20_000)));
    return;
  }

  if (sel.kind === 'gh') {
    const gh = state.github;
    const job = gh?.run?.jobs.find((j) => j.name === sel.id);
    $('#detail-title').textContent = job?.name ?? 'GitHub Actions';
    $('#detail-sub').textContent = job
      ? `${ghStatus(job)} · ${ago(job.completedAt ?? job.startedAt)}`
      : '';
    if (!job) return;

    const steps = el('div', 'bars');
    for (const s of job.steps) {
      const row = el('div', 'bar-row');
      const st =
        s.conclusion === 'success' ? 'passed' : s.conclusion === 'failure' ? 'failed' : 'skipped';
      const icon = el('span', `icon ${st}`, ICON[st]);
      row.append(icon, el('span', 'muted', s.name), el('span', ''));
      steps.append(row);
    }
    box.append(steps);

    if (ghStatus(job) === 'failed') {
      box.append(
        el(
          'div',
          'banner bad',
          job.failedStep ? `Failed at step: ${job.failedStep}` : 'This job failed',
        ),
      );
      const pre = el('pre', 'log', 'Fetching the failing step’s log…');
      box.append(pre);
      const res = await fetch(`/api/github/log?run=${gh.run.databaseId}`).then((r) => r.json());
      pre.textContent = res.ok ? res.log : `Could not read the log: ${res.reason}`;
    }
    return;
  }

  if (sel.kind === 'vps') {
    const vps = state.vps;
    $('#detail-title').textContent = 'Production server';
    $('#detail-sub').textContent = vps?.ok ? vps.host : (vps?.reason ?? '');
    if (!vps?.ok) {
      box.append(el('div', 'banner bad', vps?.reason ?? 'No connection'));
      return;
    }
    const drift = state.git?.originSha && vps.sha !== state.git.originSha;
    if (drift) {
      box.append(
        el(
          'div',
          'banner hint',
          `Server is on ${vps.shortSha}, origin/${state.config.branch} is on ${state.git.originSha.slice(0, 7)}. The poller deploys within ~2 minutes of CI going green.`,
        ),
      );
    }
    const procs = el('div', 'bars');
    for (const p of vps.processes) {
      const row = el('div', 'bar-row');
      const st = p.status === 'online' ? 'passed' : 'failed';
      row.append(
        el('span', `icon ${st}`, ICON[st]),
        el('span', p.ours ? '' : 'faint', `${p.name}${p.ours ? '' : ' (not ours)'}`),
        el('span', 'mono faint', `${Math.round(p.memory / 1048576)}MB`),
      );
      procs.append(row);
    }
    box.append(procs);
    box.append(el('pre', 'log', vps.log.join('\n') || 'No deploy log lines.'));
    return;
  }

  if (sel.kind === 'git') {
    const g = state.git;
    $('#detail-title').textContent = 'Working tree';
    $('#detail-sub').textContent = `${g.branch} · ${g.shortSha}`;
    box.append(
      el(
        'div',
        'banner hint',
        g.dirty
          ? `${g.dirty} file(s) changed but not committed. CI only ever sees what you push.`
          : g.ahead
            ? `${g.ahead} commit(s) ahead of origin/${state.config.branch}. Push to start the pipeline.`
            : 'Everything here is on origin. CI and the server are working from the same code.',
      ),
    );
    box.append(el('pre', 'log', `${g.subject}\n\n${g.author} · ${ago(g.committedAt)}`));
  }
}

// ------------------------------------------------------------- side panels

function renderSide() {
  const g = state.git ?? {};
  const gitBox = $('#git');
  gitBox.replaceChildren();
  const dl = el('dl', 'kv');
  const rows = [
    ['Branch', g.branch ?? '—'],
    ['Commit', `${g.shortSha ?? '—'} · ${g.subject ?? ''}`],
    ['Uncommitted', g.dirty ? `${g.dirty} file(s)` : 'none'],
    ['Unpushed', g.ahead ? `${g.ahead} commit(s)` : 'none'],
  ];
  for (const [k, v] of rows) {
    dl.append(el('dt', null, k), el('dd', null, String(v)));
  }
  gitBox.append(dl);

  const vps = state.vps;
  const vpsBox = $('#vps');
  vpsBox.replaceChildren();
  if (!vps?.ok) {
    vpsBox.append(el('div', 'empty', vps?.reason ?? 'Reading…'));
  } else {
    const dl2 = el('dl', 'kv');
    const drift = state.git?.originSha && vps.sha !== state.git.originSha;
    const pill = el(
      'span',
      `pill ${vps.lastDeployFailed ? 'bad' : drift ? 'warn' : 'ok'}`,
      vps.lastDeployFailed ? 'deploy failed' : drift ? 'behind' : 'up to date',
    );
    for (const [k, v] of [
      ['Running', vps.shortSha || '—'],
      ['Deployed', ago(vps.deployedAt)],
      ['Load', vps.load || '—'],
      ['Memory', vps.mem ? `${vps.mem} MB` : '—'],
      ['Disk', vps.disk || '—'],
    ]) {
      dl2.append(el('dt', null, k), el('dd', null, String(v)));
    }
    dl2.append(
      el('dt', null, 'State'),
      (() => {
        const d = el('dd');
        d.append(pill);
        return d;
      })(),
    );
    vpsBox.append(dl2);
  }

  const runsBox = $('#runs');
  runsBox.replaceChildren();
  if (!state.runs.length) {
    runsBox.append(el('div', 'empty', 'No local runs yet.'));
  } else {
    for (const r of state.runs) {
      const row = el('div', 'run-row');
      const st = r.status === 'passed' ? 'passed' : r.status === 'running' ? 'running' : 'failed';
      row.append(
        el('span', `icon ${st}`, ICON[st]),
        el('span', null, `${r.git.shortSha} · ${r.profile}`),
        el('span', 'mono faint', ago(r.startedAt)),
      );
      row.addEventListener('click', async () => {
        state.run = await fetch(`/api/run/${r.id}`).then((x) => x.json());
        state.selected = state.run.stages.find((s) => s.status === 'failed')
          ? { kind: 'local', id: state.run.stages.find((s) => s.status === 'failed').id }
          : null;
        renderFlow();
        renderDetail();
      });
      runsBox.append(row);
    }
  }
}

// ------------------------------------------------------------------ wiring

async function load() {
  const data = await fetch('/api/state').then((r) => r.json());
  Object.assign(state, data);
  state.config = data.config;
  if (!state.run && data.runs.length) state.run = data.runs[0];
  if (!state.selected && state.run?.status === 'failed') {
    const failed = state.run.stages.find((s) => s.status === 'failed');
    if (failed) state.selected = { kind: 'local', id: failed.id };
  }
  $('#repo-label').textContent = `${data.config.repo} · ${data.config.branch}`;
  renderFlow();
  renderSide();
  renderDetail();
}

function connect() {
  const es = new EventSource('/api/events');
  es.onopen = () => $('#live-dot').classList.remove('stale');
  es.onerror = () => $('#live-dot').classList.add('stale');
  es.onmessage = (msg) => {
    const e = JSON.parse(msg.data);
    if (e.type === 'run:start') {
      state.run = e.run;
      state.liveLog.clear();
      state.selected = null;
      setRunning(true);
      renderFlow();
      renderDetail();
    }
    if (e.type === 'stage:start' && state.run) {
      const s = state.run.stages.find((x) => x.id === e.stageId);
      if (s) s.status = 'running';
      renderFlow();
    }
    if (e.type === 'stage:log') {
      state.liveLog.set(e.stageId, (state.liveLog.get(e.stageId) ?? '') + e.chunk);
      if (state.selected?.kind === 'local' && state.selected.id === e.stageId) renderDetail();
    }
    if (e.type === 'stage:end' && state.run) {
      const i = state.run.stages.findIndex((x) => x.id === e.stageId);
      if (i >= 0) state.run.stages[i] = e.stage;
      // Jump straight to the break: that is the whole point of the console.
      if (e.stage.status === 'failed') state.selected = { kind: 'local', id: e.stageId };
      renderFlow();
      renderDetail();
    }
    if (e.type === 'run:end') {
      state.run = e.run;
      setRunning(false);
      renderFlow();
      renderDetail();
      void load();
    }
    if (e.type === 'remote') {
      state.github = e.github;
      state.vps = e.vps;
      state.health = e.health;
      state.git = e.git;
      renderFlow();
      renderSide();
      if (['gh', 'vps', 'git'].includes(state.selected?.kind)) renderDetail();
    }
  };
}

function setRunning(on) {
  $('#run').disabled = on;
  $('#run-full').disabled = on;
  $('#run').textContent = on ? 'Running…' : 'Run pipeline';
}

$('#run').addEventListener('click', () => fetch('/api/run?profile=quality', { method: 'POST' }));
$('#run-full').addEventListener('click', () => fetch('/api/run?profile=full', { method: 'POST' }));
$('#refresh').addEventListener('click', async () => {
  $('#refresh').disabled = true;
  await fetch('/api/refresh', { method: 'POST' });
  await load();
  $('#refresh').disabled = false;
});

await load();
connect();
