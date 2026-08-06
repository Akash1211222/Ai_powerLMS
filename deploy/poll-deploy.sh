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
# Logs: journalctl -u fca-lms-deploy -f
# =============================================================================
set -uo pipefail

LMS_ROOT="${LMS_ROOT:-/opt/fca-lms}"
BRANCH="${BRANCH:-main}"
REPO="${REPO:-Akash1211222/Ai_powerLMS}"
STATE_DIR="${STATE_DIR:-/var/lib/fca-lms}"
STATE_FILE="$STATE_DIR/deploy-state"
LOCK_FILE="/var/lock/fca-lms-poll.lock"

log() { printf '[poll] %s\n' "$*"; }

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
# Ask GitHub whether this commit's checks passed. Fail closed: anything other
# than an explicit all-green answer means we do not deploy on this tick.
# ---------------------------------------------------------------------------
CHECKS="$(curl -fsS -m 25 \
  -H 'Accept: application/vnd.github+json' \
  "https://api.github.com/repos/$REPO/commits/$REMOTE_SHA/check-runs?per_page=100" 2>/dev/null)"

if [[ -z "$CHECKS" ]]; then
  log "could not read check status — will retry next tick"
  exit 0
fi

VERDICT="$(printf '%s' "$CHECKS" | python3 -c '
import json, sys
try:
    runs = json.load(sys.stdin).get("check_runs", [])
except Exception:
    print("unknown"); sys.exit()
if not runs:
    print("pending"); sys.exit()          # CI has not reported yet
if any(r.get("status") != "completed" for r in runs):
    print("pending"); sys.exit()
ok = {"success", "skipped", "neutral"}
bad = [r["name"] for r in runs if r.get("conclusion") not in ok]
print("failed:" + ",".join(bad) if bad else "passed")
' 2>/dev/null)"

case "$VERDICT" in
  passed)
    log "checks green — deploying ${REMOTE_SHA:0:8}"
    if bash "$LMS_ROOT/deploy/deploy.sh"; then
      log "deploy OK: $(git rev-parse --short HEAD)"
    else
      # deploy.sh already logged the detail and left the previous version
      # serving; record nothing so the next tick retries.
      log "DEPLOY FAILED for ${REMOTE_SHA:0:8} — see output above"
      exit 1
    fi
    ;;
  pending)
    log "CI still running for ${REMOTE_SHA:0:8} — waiting"
    ;;
  failed:*)
    log "CI FAILED for ${REMOTE_SHA:0:8} (${VERDICT#failed:}) — not deploying"
    echo "$REMOTE_SHA=rejected" >> "$STATE_FILE"
    ;;
  *)
    log "could not interpret check status — will retry next tick"
    ;;
esac
