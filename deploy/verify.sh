#!/usr/bin/env bash
# =============================================================================
# FutureCorp LMS — post-deploy verification. Run on the VPS, any time:
#
#   bash /opt/fca-lms/deploy/verify.sh
#
# Answers "is the deploy actually correct", which is not the same question as
# "did the deploy report success". A deploy has already once finished green
# while silently skipping its own RBAC seed, leaving production enforcing a
# stale permission matrix — so this checks observable state, not log lines.
#
# Exits non-zero if anything is wrong, and every check says something. A check
# that can pass by printing nothing is worse than no check: an earlier version
# of this script failed with a syntax error and rendered an empty section that
# read exactly like a pass.
# =============================================================================
set -uo pipefail

LMS_ROOT="${LMS_ROOT:-/opt/fca-lms}"
PUBLIC="${PUBLIC:-1}"          # PUBLIC=0 to skip internet-facing checks
FAILURES=0

ok()   { printf '  \033[32mOK\033[0m    %s\n' "$*"; }
bad()  { printf '  \033[31mFAIL\033[0m  %s\n' "$*"; FAILURES=$((FAILURES + 1)); }
head_() { printf '\n\033[1;36m== %s\033[0m\n' "$*"; }

cd "$LMS_ROOT" || { echo "FATAL: $LMS_ROOT missing"; exit 1; }
DB=$(grep -m1 '^DATABASE_URL=' .env | cut -d= -f2- | sed "s/^['\"]//; s/['\"]$//" | cut -d? -f1)

# ---------------------------------------------------------------------------
head_ "Deployed code"
LOCAL_SHA=$(git rev-parse HEAD 2>/dev/null)
echo "  $(git rev-parse --short HEAD)  $(git log -1 --pretty=%s | cut -c1-60)"
if REMOTE_SHA=$(git ls-remote origin refs/heads/main 2>/dev/null | awk '{print $1}') && [ -n "$REMOTE_SHA" ]; then
  if [ "$LOCAL_SHA" = "$REMOTE_SHA" ]; then
    ok "up to date with origin/main"
  else
    bad "behind origin/main (deployed ${LOCAL_SHA:0:8}, main is ${REMOTE_SHA:0:8})"
  fi
else
  echo "  (could not reach GitHub — skipping drift check)"
fi

# ---------------------------------------------------------------------------
head_ "Database migrations"
STATUS=$(cd packages/database && DATABASE_URL="$DB" npx --no-install prisma migrate status 2>&1)
if echo "$STATUS" | grep -qi "Database schema is up to date"; then
  ok "no pending migrations ($(psql "$DB" -tAc 'SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL;' 2>/dev/null | tr -d ' ') applied)"
else
  bad "pending or failed migrations"
  echo "$STATUS" | grep -iE "pending|failed|not yet" | head -5 | sed 's/^/        /'
fi

# ---------------------------------------------------------------------------
# Compare the database against the matrix in code rather than hardcoded counts,
# so this stays correct as roles evolve. Editing rbac.ts without re-seeding is
# the exact failure this catches.
head_ "Roles and permissions (database vs packages/shared)"
node <<'NODE'
const { createRequire } = require('node:module');
const path = require('node:path');
const root = process.env.LMS_ROOT || '/opt/fca-lms';
const requireShared = createRequire(path.join(root, 'packages/shared/package.json'));
const requireDb = createRequire(path.join(root, 'packages/database/package.json'));
const { applyEnvFile } = require(path.join(root, 'deploy/load-env.cjs'));
applyEnvFile(path.join(root, '.env'), { override: true });

(async () => {
  const { DEFAULT_ROLE_PERMISSIONS, ROLES } = requireShared('@fca/shared');
  const { PrismaClient } = requireDb('@prisma/client');
  const prisma = new PrismaClient();
  const rows = await prisma.role.findMany({
    include: { permissions: { include: { permission: true } } },
  });
  const live = new Map(rows.map((r) => [r.name, new Set(r.permissions.map((p) => p.permission.key))]));

  let bad = 0;
  for (const role of ROLES) {
    const want = new Set(DEFAULT_ROLE_PERMISSIONS[role]);
    const have = live.get(role);
    if (!have) {
      console.log(`  FAIL  ${role} missing from the database`);
      bad++;
      continue;
    }
    const missing = [...want].filter((p) => !have.has(p));
    if (missing.length) {
      console.log(`  FAIL  ${role}: ${missing.length} permission(s) not seeded -> ${missing.join(', ')}`);
      bad++;
    } else {
      // Extra permissions are legitimate — an admin may grant beyond the
      // default — so report them without failing.
      const extra = [...have].filter((p) => !want.has(p));
      console.log(
        `  OK    ${role.padEnd(18)} ${have.size} permissions` +
          (extra.length ? ` (+${extra.length} granted beyond default)` : ''),
      );
    }
  }
  await prisma.$disconnect();
  process.exit(bad ? 1 : 0);
})().catch((e) => {
  console.log('  FAIL  could not compare RBAC:', e.message);
  process.exit(1);
});
NODE
[ $? -eq 0 ] || FAILURES=$((FAILURES + 1))

# ---------------------------------------------------------------------------
head_ "Processes"
pm2 jlist 2>/dev/null > /tmp/fca-pm.json
if [ ! -s /tmp/fca-pm.json ]; then
  bad "pm2 jlist produced no output"
else
  # Quoted heredoc: nothing here is touched by the shell or by ssh.
  python3 <<'PY'
import json, time, sys
apps = json.load(open('/tmp/fca-pm.json'))
now = time.time() * 1000
seen = {}
for a in sorted(apps, key=lambda x: x['name']):
    e = a['pm2_env']
    up = int((now - e.get('pm_uptime', 0)) / 1000)
    seen[a['name']] = e['status']
    tag = '   <-- landing page, must not be restarted by a deploy' if a['name'] == 'futurecorp-api' else ''
    print('  %-18s %-8s restarts=%-4s uptime=%dh%dm%s' % (
        a['name'], e['status'], e.get('restart_time', 0), up // 3600, (up % 3600) // 60, tag))

problems = 0
for required in ('futurecorp-api', 'fca-lms-api', 'fca-lms-web', 'fca-lms-worker'):
    if required not in seen:
        print('  FAIL  %s is not running' % required); problems += 1
    elif seen[required] != 'online':
        print('  FAIL  %s is %s' % (required, seen[required])); problems += 1
sys.exit(1 if problems else 0)
PY
  [ $? -eq 0 ] || FAILURES=$((FAILURES + 1))
fi

# ---------------------------------------------------------------------------
head_ "Health (localhost)"
READY=$(curl -fsS -m 8 http://127.0.0.1:4001/health/ready 2>/dev/null)
case "$READY" in
  *'"status":"ok"'*) ok "API ready (database + redis up)" ;;
  '')               bad "API /health/ready unreachable" ;;
  *)                bad "API not ready: $(echo "$READY" | head -c 120)" ;;
esac
WEB=$(curl -s -o /dev/null -m 10 -w '%{http_code}' http://127.0.0.1:3000/ 2>/dev/null)
[ "$WEB" = "200" ] && ok "web responds 200" || bad "web responds $WEB"

# ---------------------------------------------------------------------------
if [ "$PUBLIC" = "1" ]; then
  head_ "Public endpoints"
  check_url() {
    code=$(curl -s -o /dev/null -m 20 -w '%{http_code}' "$1" 2>/dev/null)
    [ "$code" = "$2" ] && ok "$1 -> $code" || bad "$1 -> $code (expected $2)"
  }
  check_url https://lms.futurecorpacademy.in/ 200
  check_url https://lms.futurecorpacademy.in/login 200
  check_url https://lms-api.futurecorpacademy.in/health 200
  # The landing page and legacy API share this box and must never be affected.
  check_url https://futurecorpacademy.in/ 200
  check_url https://www.futurecorpacademy.in/ 200

  code=$(curl -s -o /dev/null -m 20 -w '%{http_code}' -X POST \
    https://lms-api.futurecorpacademy.in/api/v1/auth/register \
    -H 'Content-Type: application/json' \
    -d '{"email":"probe@example.com","password":"Password123","firstName":"A","lastName":"B"}' 2>/dev/null)
  [ "$code" = "404" ] && ok "self-registration is gone (404)" \
                      || bad "POST /auth/register -> $code (expected 404 — this is a paid LMS)"
fi

# ---------------------------------------------------------------------------
printf '\n'
if [ "$FAILURES" -eq 0 ]; then
  printf '\033[32mAll checks passed.\033[0m\n'
  exit 0
fi
printf '\033[31m%d check(s) FAILED.\033[0m\n' "$FAILURES"
exit 1
