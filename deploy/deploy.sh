#!/usr/bin/env bash
# =============================================================================
# FutureCorp LMS — continuous deployment (invoked by GitHub Actions over SSH)
#
# Deploys ONLY the LMS. The landing page and legacy API are never touched:
#
#   * Never runs apt-get, certbot, or any nginx command.
#   * Never runs `pm2 restart all` / `pm2 reload all` — LMS process names only.
#   * Builds inside a systemd scope with a hard MemoryMax, so a runaway build
#     is OOM-killed within its own cgroup instead of letting the kernel pick a
#     victim (which could be futurecorp-api). This box has 1 vCPU / 3.8G RAM,
#     so the build is also niced to the floor and given a low CPU weight —
#     the landing page keeps priority for the whole deploy.
#   * Builds BEFORE stopping anything. A failed build aborts with the currently
#     running version still serving.
#
# Manual run:  bash /opt/fca-lms/deploy/deploy.sh
# =============================================================================
set -euo pipefail

# ---------------------------------------------------------------------------
# Re-exec from a copy outside the working tree.
#
# This script checks out new code partway through, which rewrites the very file
# bash is executing. Bash reads scripts incrementally, so the rest of the run
# comes from the NEW file at the OLD byte offset — it can skip steps or splice
# two versions together. That is not theoretical: the deploy that shipped
# 771ad7f silently skipped its own newly added "Sync roles + permissions" step,
# leaving production enforcing a stale permission matrix.
#
# Copying to a temp file first makes the running script immutable for the
# duration, whatever the checkout does to the tree.
# ---------------------------------------------------------------------------
if [[ "${FCA_DEPLOY_REEXEC:-}" != "1" ]]; then
  _self_copy="$(mktemp /tmp/fca-deploy.XXXXXX.sh)"
  cat "${BASH_SOURCE[0]}" > "$_self_copy"
  export FCA_DEPLOY_REEXEC=1
  bash "$_self_copy" "$@"
  _rc=$?
  rm -f "$_self_copy"
  exit $_rc
fi

LMS_ROOT="${LMS_ROOT:-/opt/fca-lms}"
BRANCH="${BRANCH:-main}"
LOCK_FILE="/var/lock/fca-lms-deploy.lock"

# PM2 processes this script is allowed to touch. Anything not in this list —
# futurecorp-api above all — must never be restarted by a deploy.
LMS_PROCS=(fca-lms-api fca-lms-web fca-lms-worker)

# Build resource ceiling. Leaves >1.5G plus swap for the OS and the landing page.
BUILD_MEM_MAX="${BUILD_MEM_MAX:-1800M}"

log() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m[warn] %s\033[0m\n' "$*"; }
die() { printf '\033[1;31m[fail] %s\033[0m\n' "$*" >&2; exit 1; }

# Run a build command with hard resource limits. If systemd-run is unavailable
# we still nice it, but the memory ceiling is the important part.
run_limited() {
  if command -v systemd-run >/dev/null 2>&1; then
    systemd-run --scope --quiet --collect \
      -p MemoryMax="$BUILD_MEM_MAX" \
      -p MemorySwapMax=2G \
      -p CPUWeight=20 \
      -- nice -n 19 ionice -c3 "$@"
  else
    nice -n 19 ionice -c3 "$@"
  fi
}

# Restart counter for the landing-page API. Compared before/after the deploy so
# a regression that disturbs it can never pass silently.
protected_restarts() {
  pm2 jlist 2>/dev/null | python3 -c '
import json, sys
try:
    apps = json.load(sys.stdin)
except Exception:
    print("unknown"); sys.exit()
for a in apps:
    if a.get("name") == "futurecorp-api":
        print(a.get("pm2_env", {}).get("restart_time", "?")); sys.exit()
print("absent")
' 2>/dev/null || echo unknown
}

assert_protected_untouched() {
  local before="$1" after
  after="$(protected_restarts)"
  if [[ "$before" != "$after" ]]; then
    warn "futurecorp-api restart count changed ($before -> $after) — investigate!"
  else
    log "Landing-page API untouched (restart count: $after)"
  fi
}

exec 9>"$LOCK_FILE"
flock -n 9 || die "another deploy is already running"

cd "$LMS_ROOT" || die "$LMS_ROOT not found"

# Snapshot the protected process so we can prove we did not disturb it.
PROTECTED_BEFORE="$(protected_restarts)"

PREV_SHA="$(git rev-parse HEAD)"
log "Current: $PREV_SHA"

log "Fetching origin/$BRANCH"
git fetch --depth 50 origin "$BRANCH"
NEW_SHA="$(git rev-parse "origin/$BRANCH")"

if [[ "$PREV_SHA" == "$NEW_SHA" ]]; then
  log "Already at $NEW_SHA — nothing to deploy"
  exit 0
fi

CHANGED="$(git diff --name-only "$PREV_SHA" "$NEW_SHA")"
log "Deploying $PREV_SHA -> $NEW_SHA"
echo "$CHANGED" | sed 's/^/    /'

git checkout -B "$BRANCH" "origin/$BRANCH"

# ---------------------------------------------------------------------------
# Docs-only changes need no install, build, migrate, or restart.
# ---------------------------------------------------------------------------
if ! echo "$CHANGED" | grep -qvE '^(docs/|README\.md|\.github/|deploy/README\.md|.*\.md$)'; then
  log "Docs-only change — skipping build and restart"
  assert_protected_untouched "$PROTECTED_BEFORE"
  exit 0
fi

# ---------------------------------------------------------------------------
# Install. .env pins NODE_ENV=production, which makes pnpm skip devDependencies
# (typescript/tsc/next live there), so install with all deps then restore.
# ---------------------------------------------------------------------------
log "Installing dependencies"
SAVED_NODE_ENV="${NODE_ENV:-production}"
unset NODE_ENV
run_limited pnpm install --frozen-lockfile || die "pnpm install failed — nothing restarted, LMS still serving old build"
export NODE_ENV="$SAVED_NODE_ENV"

# ---------------------------------------------------------------------------
# Build everything BEFORE touching a running process. A failure here leaves the
# current version serving and the landing page completely unaffected.
# ---------------------------------------------------------------------------
log "Building (memory-capped at $BUILD_MEM_MAX, lowest CPU priority)"
for pkg in @fca/shared @fca/database @fca/ai @fca/analytics @fca/ui @fca/api @fca/worker; do
  run_limited pnpm --filter "$pkg" build || die "build failed at $pkg — nothing restarted"
done

# Next bakes the public API URL at build time.
set -a; . "$LMS_ROOT/.env"; set +a
export NEXT_PUBLIC_API_BASE_URL="${NEXT_PUBLIC_API_BASE_URL:-https://lms-api.futurecorpacademy.in/api/v1}"
run_limited pnpm --filter @fca/web build || die "web build failed — nothing restarted"

# ---------------------------------------------------------------------------
# Migrations are forward-only and additive; they run after a green build.
# ---------------------------------------------------------------------------
log "Applying database migrations"
run_limited pnpm db:migrate:deploy || die "migration failed — nothing restarted"

# Roles/permissions live in code (packages/shared/src/rbac.ts) but are enforced
# from the role_permissions table, so editing the matrix does nothing until it
# is re-seeded. Without this a permission change ships silently and has no
# effect in production. Idempotent (pure upserts) and creates no users.
#
# Note it only ADDS mappings — revoking a permission needs a deliberate
# migration, since blindly deleting rows would clobber any hand-granted ones.
log "Syncing roles + permissions"
run_limited node deploy/seed-rbac.mjs || die "RBAC seed failed — nothing restarted"

# ---------------------------------------------------------------------------
# Hand the tree to the unprivileged user the processes run as.
#
# Everything above this line runs as root, so whatever the build just wrote is
# root-owned. Most of it is only ever read, so this is not load-bearing today —
# but ownership that depends on which step last touched a file is a trap: the
# first build that creates a directory the app has to write to would fail at
# runtime, long after the deploy reported success.
#
# .env is put back deliberately. pm2 runs as root, reads it and injects it into
# each process, so the app never needs the secrets on disk — and a file the app
# user cannot read is one an app-level file-read bug cannot leak.
# ---------------------------------------------------------------------------
if [[ -n "${APP_USER:-}" ]]; then
  # Fail here rather than after the restart: pm2 cannot start a process as a
  # user that does not exist, and this check keeps that an aborted deploy
  # (old build still serving) instead of an outage.
  id "$APP_USER" >/dev/null 2>&1 ||
    die "APP_USER=$APP_USER does not exist — create it before restarting into it"

  log "Handing the tree to $APP_USER"
  chown -R "$APP_USER:${APP_GROUP:-$APP_USER}" "$LMS_ROOT" ||
    die "could not give $LMS_ROOT to $APP_USER — nothing restarted"
  chown root:root "$LMS_ROOT/.env" && chmod 600 "$LMS_ROOT/.env"
fi

# ---------------------------------------------------------------------------
# Restart LMS processes by explicit name. Never `all`.
# ---------------------------------------------------------------------------
log "Restarting LMS processes: ${LMS_PROCS[*]}"
# Restart THROUGH the ecosystem file, not by process name. `pm2 restart <name>
# --update-env` re-reads the *invoking shell's* environment, not .env — so the
# process silently keeps whatever env it was first started with and edits to
# .env never take effect. Found the hard way: new SMTP settings were ignored
# and the API kept dialling the default 127.0.0.1:587.
#
# The ecosystem file loads .env itself (deploy/load-env.cjs) and defines only
# the three fca-lms-* apps, so this stays LMS-scoped and cannot touch
# futurecorp-api.
pm2 restart "$LMS_ROOT/deploy/ecosystem.config.cjs" --update-env || die "pm2 restart failed"
pm2 save --force >/dev/null 2>&1 || true

# ---------------------------------------------------------------------------
# Health gate.
# ---------------------------------------------------------------------------
log "Health checks"
ok=0
for i in $(seq 1 30); do
  api="$(curl -fsS -m 5 http://127.0.0.1:4001/health/ready 2>/dev/null || true)"
  web="$(curl -s -o /dev/null -m 8 -w '%{http_code}' http://127.0.0.1:3000/ 2>/dev/null || echo 000)"
  if [[ "$api" == *'"status":"ok"'* && "$web" == "200" ]]; then ok=1; break; fi
  sleep 3
done

assert_protected_untouched "$PROTECTED_BEFORE"

if [[ "$ok" != "1" ]]; then
  warn "LMS unhealthy after deploy of $NEW_SHA"
  pm2 logs fca-lms-api --lines 40 --nostream 2>/dev/null || true
  echo
  warn "Landing page and legacy API are unaffected. To roll the LMS back:"
  warn "  cd $LMS_ROOT && git checkout -B $BRANCH $PREV_SHA && bash deploy/deploy.sh"
  die "health check failed"
fi

log "Deployed $NEW_SHA — LMS healthy"
