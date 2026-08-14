#!/usr/bin/env bash
# =============================================================================
# FutureCorp LMS — restore the public demo to its seeded state.
#
# The demo is one shared account, so whatever a visitor types stays there for
# the next one. This puts it back on a timer.
#
# It re-runs the demo seed, which clears its own artifacts first (accounts on
# @demo.futurecorp.in, courses `demo-*`, batches `DEMO*`, the demo and north
# organisations) and recreates them. Nothing outside those markers is touched,
# so the real organisation is never in scope — checked before this was first
# run, and worth re-checking if the seed's cleanup ever grows.
#
# Two things it is careful about on a 1-vCPU box:
#
#   * It hashes ~100 passwords, which is real CPU. Run at the lowest priority
#     so a visitor reading a lesson keeps the processor.
#   * It must not overlap a deploy, which is also rebuilding and restarting.
#     Both take the same lock.
#
# Logs: journalctl -u fca-lms-demo-reset -f
# =============================================================================
set -uo pipefail

LMS_ROOT="${LMS_ROOT:-/opt/fca-lms}"
LOCK_FILE="/var/lock/fca-lms-deploy.lock"
RESET_MEM_MAX="${RESET_MEM_MAX:-900M}"

log() { printf '[demo-reset] %s\n' "$*"; }

cd "$LMS_ROOT" || { log "ERROR: $LMS_ROOT missing"; exit 1; }

if [[ "$(grep -c '^DEMO_MODE_ENABLED=true' .env || true)" != "1" ]]; then
  log "demo mode is off — nothing to reset"
  exit 0
fi

# Shared with deploy.sh: a reset midway through a rebuild would race the
# migration step. Skip rather than queue; the next hour will do.
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  log "a deploy is running — skipping this reset"
  exit 0
fi

DB="$(grep -m1 '^DATABASE_URL=' .env | cut -d= -f2-)"
if [[ -z "$DB" ]]; then
  log "ERROR: no DATABASE_URL"
  exit 1
fi

log "restoring demo data"
if systemd-run --scope --quiet \
     -p MemoryMax="$RESET_MEM_MAX" -p CPUWeight=20 \
     nice -n 19 env DATABASE_URL="$DB" \
     pnpm --filter @fca/database exec tsx prisma/demo-seed.ts >/tmp/fca-demo-reset.log 2>&1; then
  log "demo data restored"
else
  # Deliberately not fatal to anything else: a failed reset leaves the previous
  # demo data in place, which is stale but still a working demo.
  log "ERROR: demo seed failed — previous demo data left in place"
  tail -20 /tmp/fca-demo-reset.log | sed 's/^/    /'
  exit 1
fi

# Visitors accumulate a session row each. They are useless the moment the
# accounts behind them are recreated, so clear them rather than letting a
# public endpoint grow a table forever.
PRUNED="$(psql "${DB%%\?*}" -tAc \
  "delete from sessions s using users u
    where s.\"userId\" = u.id
      and u.email like '%@demo.futurecorp.in'
    returning 1;" 2>/dev/null | grep -c 1 || true)"
log "cleared ${PRUNED:-0} demo sessions"
