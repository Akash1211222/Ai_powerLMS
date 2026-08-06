#!/usr/bin/env bash
# =============================================================================
# FutureCorp LMS — pull-based deployment poller (systemd timer, every 2 min)
#
# Why polling instead of CI pushing over SSH: GitHub-hosted runners are
# intermittently unable to reach this box at all — sshd logs no attempt and
# port 443 times out too, so a whole runner IP is being filtered upstream.
# Retries did not help. Inverting the direction removes the problem entirely:
# nothing has to reach IN, the server only makes outbound HTTPS calls.
#
# It still refuses to deploy anything CI has not passed, so the safety gate
# that made the push model worthwhile is preserved:
#
#   1. `git ls-remote` for the tip of main   (cheap, no API rate limit)
#   2. if it differs from the deployed SHA, ask the GitHub API whether that
#      commit's checks are green
#   3. only then hand off to deploy.sh, which owns all the LMS-only safety
#
# Verdicts are cached per SHA so a failed commit is judged once, not on every
# tick — the unauthenticated API allows 60 requests/hour and this must not
# starve itself.
#
# This script is INSTALLED OUTSIDE the repo (/usr/local/bin) and run from
# there. It must not execute from inside the working tree it checks out: a
# deploy that moves HEAD would swap the file out from under the running bash,
# which reads scripts incrementally. It keeps itself current by refreshing the
# installed copy after each successful deploy, via an atomic rename so the
# running process keeps reading its original inode.
#
# Logs: journalctl -u fca-lms-deploy -f
# =============================================================================
set -uo pipefail

LMS_ROOT="${LMS_ROOT:-/opt/fca-lms}"
BRANCH="${BRANCH:-main}"
REPO="${REPO:-Akash1211222/Ai_powerLMS}"
# Only this workflow gates a deploy — see the check below.
CI_WORKFLOW="${CI_WORKFLOW:-ci.yml}"
STATE_DIR="${STATE_DIR:-/var/lib/fca-lms}"
STATE_FILE="$STATE_DIR/deploy-state"
LOCK_FILE="/var/lock/fca-lms-poll.lock"

SELF="${SELF:-/usr/local/bin/fca-lms-poll-deploy}"

log() { printf '[poll] %s\n' "$*"; }

# Pull the just-deployed versions of this script and the systemd units into
# place, so shipping a change to them takes effect on the next tick.
#
# The rename is what makes replacing a *running* script safe: mv swaps the
# directory entry while this process keeps reading the inode it started with.
# Copying over the file in place would corrupt the current run.
refresh_installed_copies() {
  local src="$LMS_ROOT/deploy/poll-deploy.sh"
  if [[ -f "$src" ]] && ! cmp -s "$src" "$SELF"; then
    local tmp="${SELF}.new.$$"
    if cp "$src" "$tmp" && chmod 755 "$tmp" && mv -f "$tmp" "$SELF"; then
      log "poller updated from repo — next tick uses it"
    else
      rm -f "$tmp"
      log "WARNING: could not refresh installed poller"
    fi
  fi

  local changed=0
  for unit in fca-lms-deploy.service fca-lms-deploy.timer; do
    if [[ -f "$LMS_ROOT/deploy/$unit" ]] && ! cmp -s "$LMS_ROOT/deploy/$unit" "/etc/systemd/system/$unit"; then
      install -m 644 "$LMS_ROOT/deploy/$unit" "/etc/systemd/system/$unit" && changed=1
    fi
  done
  if [[ "$changed" == "1" ]]; then
    systemctl daemon-reload && log "systemd units refreshed"
  fi
}

mkdir -p "$STATE_DIR"

# Never let two polls overlap; a deploy can outlast the 2-minute interval.
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  log "previous run still active — skipping this tick"
  exit 0
fi

cd "$LMS_ROOT" || { log "ERROR: $LMS_ROOT missing"; exit 1; }

LOCAL_SHA="$(git rev-parse HEAD 2>/dev/null)"
REMOTE_SHA="$(git ls-remote origin "refs/heads/$BRANCH" 2>/dev/null | awk '{print $1}')"

if [[ -z "$REMOTE_SHA" ]]; then
  log "could not reach GitHub — will retry next tick"
  exit 0
fi

if [[ "$LOCAL_SHA" == "$REMOTE_SHA" ]]; then
  exit 0   # up to date; stay quiet so the journal only shows real events
fi

# Already judged this commit? Don't re-query the API every 2 minutes.
if [[ -f "$STATE_FILE" ]] && grep -qx "$REMOTE_SHA=rejected" "$STATE_FILE"; then
  exit 0
fi

log "new commit on $BRANCH: ${REMOTE_SHA:0:8} (deployed: ${LOCAL_SHA:0:8})"

# ---------------------------------------------------------------------------
# Ask GitHub whether OUR CI workflow passed for this commit. Fail closed:
# anything other than an explicit green answer means no deploy this tick.
#
# Deliberately scoped to ci.yml rather than "all check runs on the commit".
# Other workflows also report against the same SHA — GitHub Pages
# (pages-build-deployment) runs on every push here, and its `deploy` check can
# sit in_progress indefinitely. Gating on every check would let an unrelated,
# stuck workflow block LMS deploys forever.
# ---------------------------------------------------------------------------
RUNS="$(curl -fsS -m 25 \
  -H 'Accept: application/vnd.github+json' \
  "https://api.github.com/repos/$REPO/actions/workflows/$CI_WORKFLOW/runs?head_sha=$REMOTE_SHA&per_page=1" 2>/dev/null)"

if [[ -z "$RUNS" ]]; then
  log "could not read CI status — will retry next tick"
  exit 0
fi

VERDICT="$(printf '%s' "$RUNS" | python3 -c '
import json, sys
try:
    runs = json.load(sys.stdin).get("workflow_runs", [])
except Exception:
    print("unknown"); sys.exit()
if not runs:
    print("pending"); sys.exit()          # CI has not been queued yet
run = runs[0]
if run.get("status") != "completed":
    print("pending"); sys.exit()          # queued / in_progress
concl = run.get("conclusion")
if concl == "success":
    print("passed")
elif concl in ("cancelled", "timed_out", "stale", "action_required", None):
    # Transient / infrastructural, not a verdict on the code. GitHub-hosted
    # runners here get backed up and auto-cancel queued runs, and a re-run
    # then goes green — so these must NOT be cached as permanently rejected
    # or the commit would be ignored forever.
    print("transient:" + str(concl))
else:
    print("failed:" + str(concl))
' 2>/dev/null)"

case "$VERDICT" in
  passed)
    log "checks green — deploying ${REMOTE_SHA:0:8}"
    if bash "$LMS_ROOT/deploy/deploy.sh"; then
      log "deploy OK: $(git rev-parse --short HEAD)"
      refresh_installed_copies
    else
      # deploy.sh already logged the detail and left the previous version
      # serving; record nothing so the next tick retries.
      log "DEPLOY FAILED for ${REMOTE_SHA:0:8} — see output above"
      exit 1
    fi
    ;;
  pending)
    log "CI not finished for ${REMOTE_SHA:0:8} — waiting"
    ;;
  transient:*)
    # Not cached: re-checked next tick, and picked up if a re-run goes green.
    log "CI ${VERDICT#transient:} for ${REMOTE_SHA:0:8} (infrastructural, not a code failure) — re-run it: gh run rerun <id>"
    ;;
  failed:*)
    log "CI FAILED for ${REMOTE_SHA:0:8} (${VERDICT#failed:}) — not deploying"
    echo "$REMOTE_SHA=rejected" >> "$STATE_FILE"
    ;;
  *)
    log "could not interpret check status — will retry next tick"
    ;;
esac
