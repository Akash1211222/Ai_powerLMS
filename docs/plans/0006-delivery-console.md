# Plan 0006 — Seeing the pipeline, and where it breaks

- Status: **Delivered**

## Context

Delivery already worked: push to `main`, CI runs three jobs, the VPS polls every
two minutes and deploys commits whose checks are green. What it did not do was
_tell you anything_ without going and looking — `gh run view`, `journalctl` over
SSH, a browser tab on the live site, and a 2000-line CI log to find one
`page.tsx(484,23)`.

Two costs came out of that. Breaks were found late, after a push, in CI, minutes
after the mistake was made. And a failure was a wall of log rather than a place
in the code.

## What was built

A local console — `pnpm pipeline:ui` — and the runner behind it.

### 1. The same stages, locally

`tools/pipeline/lib/stages.mjs` defines the pipeline once, each stage naming the
CI job it mirrors. `pnpm pipeline` runs the quality profile (Prisma client,
typecheck, lint, unit tests, build; ~70s warm). `pnpm pipeline:full` adds what
the integration job does: creates the test database if missing, migrates, seeds,
then runs the API integration and e2e suite.

Parity is the point, so the gaps are shown rather than hidden: the container
image build is listed and marked _CI only_, because this machine has no Docker.
A stage that cannot run locally must not look like one that passed.

### 2. The exact point of failure

`lib/parse.mjs` turns tool output into `{file, line, col, message}` plus the
surrounding source. Two things make that harder than a regex:

- Turbo prefixes every line with `@fca/web:typecheck: `, and
- the tool underneath reports paths relative to **its own package**, so
  `src/lib/ide-api.ts` in the log is `apps/web/src/lib/ide-api.ts` on disk.

Undoing both is what separates "a failure happened" from "line 9 of this file".
The first version of the parser did neither and silently found nothing, which is
why `parse.test.mjs` locks both in.

A location is only reported if the file exists. A wrong `file:line` sends you to
edit code that was never broken, so when nothing parses the console says so and
shows the log tail instead.

### 3. The whole journey, not just this machine

Four lanes, because a commit passes through four places and any of them can be
the one that is wrong:

| Lane           | Shows                               | Read via     |
| -------------- | ----------------------------------- | ------------ |
| This Mac       | local stages, durations, failures   | the runner   |
| Git            | uncommitted and unpushed work       | `git`        |
| GitHub Actions | each job, the failing step, its log | `gh`         |
| Production     | deployed SHA, poller, pm2, health   | `ssh`, HTTPS |

Drift is the question this answers at a glance: _is what I tested what is
running?_ The server's SHA sits beside `origin/main`'s, and "behind" is an
amber state with an explanation, not a red one — the poller deploys within two
minutes of CI going green, and that is working as designed.

### 4. A gate before the push

`.githooks/pre-push` runs the quality profile and refuses the push if it fails,
printing the file and line. `git push --no-verify` when you mean to.

## Decisions worth keeping

**Zero dependencies, no build step.** Plain `.mjs` and a static page served by
Node's own HTTP server. A local tool that needs its own toolchain maintained is
a tool that stops working; nothing here ships to production either.

**Read-only by construction.** The collectors run `git` queries that do not move
HEAD, `gh api` GETs, and one fixed SSH script. The browser cannot supply a
command to run on the server — the console holds a root session, and the only
safe shape for that is a closed set of reads. The console must never be the
thing that changes production.

**Bound to 127.0.0.1.** It can start builds and reaches the VPS; a port on
`0.0.0.0` would hand both to anything on the same network.

**Deployment stays pull-based.** Inverting it to push-from-CI was considered and
rejected again for the reason in `deploy/README.md`: GitHub-hosted runners are
intermittently unable to reach this box at all. The console makes the existing
model _visible_, which was the actual complaint.

**The dev database is never touched.** The full profile refuses to run if
`TEST_DATABASE_URL` equals `DATABASE_URL` — the suite seeds and truncates, and
one wrong URL would wipe the work in progress.

## Not done

- No history beyond this machine: runs live in `.pipeline/`, which is ignored.
  A shared record belongs in CI, which already has one.
- No deploy button. Deploys are the poller's job, and a second way to deploy is
  a second thing that can be wrong.
- The container image stage is still proved only in CI.
