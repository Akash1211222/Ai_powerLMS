#!/usr/bin/env bash
# =============================================================================
# FutureCorp LMS — VPS setup (coexists with landing + legacy API on :4000)
# Run as root on srv1236125 AFTER:
#   1) DNS A records: lms.futurecorpacademy.in + lms-api.futurecorpacademy.in → 88.222.244.192
#   2) Repo is at /opt/fca-lms (git clone or rsync)
#
# Does NOT modify:
#   /var/www/futurecorp
#   /root/futurecorp
#   PM2 futurecorp-api
#   nginx sites for futurecorpacademy.in / api.futurecorpacademy.in
# =============================================================================
set -euo pipefail

LMS_ROOT="${LMS_ROOT:-/opt/fca-lms}"
REPO_URL="${REPO_URL:-https://github.com/Akash1211222/Ai_powerLMS.git}"
BRANCH="${BRANCH:-main}"

echo "==> Swap (2G) if missing"
if ! swapon --show | grep -q .; then
  fallocate -l 2G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=2048
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo "==> Packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y postgresql postgresql-contrib redis-server nginx git curl build-essential openssl

# Node 22 via NodeSource (engines.node >=22; Node 20 is not enough)
NODE_MAJOR="$(node -v 2>/dev/null | cut -d. -f1 | tr -d v || echo 0)"
if ! command -v node >/dev/null || [[ "${NODE_MAJOR}" -lt 22 ]]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
echo "Node $(node -v) / pnpm will be activated next"
corepack enable
corepack prepare pnpm@9.12.0 --activate
npm install -g pm2@latest

echo "==> Postgres role/db for LMS only"
sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='fca_lms'" | grep -q 1 \
  || sudo -u postgres psql -c "CREATE ROLE fca_lms LOGIN PASSWORD '$(openssl rand -base64 24)'"
# If role already existed, password may stay; ensure DB exists
sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='fca_lms'" | grep -q 1 \
  || sudo -u postgres createdb -O fca_lms fca_lms
sudo -u postgres psql -c "ALTER ROLE fca_lms WITH CREATEDB;"

echo "==> Redis — enable, bind localhost"
systemctl enable --now redis-server
systemctl enable --now postgresql

echo "==> Clone / update LMS repo to $LMS_ROOT"
mkdir -p "$(dirname "$LMS_ROOT")"
if [[ ! -d "$LMS_ROOT/.git" ]]; then
  git clone --depth 1 --branch "$BRANCH" "$REPO_URL" "$LMS_ROOT"
else
  git -C "$LMS_ROOT" remote set-url origin "$REPO_URL" || true
  git -C "$LMS_ROOT" fetch origin "$BRANCH"
  git -C "$LMS_ROOT" checkout -B "$BRANCH" "origin/$BRANCH"
fi
cd "$LMS_ROOT"

if [[ ! -f deploy/env.production.example || ! -f deploy/setup-lms-vps.sh ]]; then
  echo "ERROR: deploy/ files missing in $LMS_ROOT — wrong or outdated clone."
  echo "Fix with:"
  echo "  rm -rf $LMS_ROOT"
  echo "  git clone --depth 1 --branch $BRANCH $REPO_URL $LMS_ROOT"
  exit 1
fi

if [[ ! -f .env ]]; then
  echo "==> Creating .env from deploy template"
  cp deploy/env.production.example .env
  DB_PASS="$(openssl rand -base64 24 | tr -d '/+=' | head -c 32)"
  ACCESS="$(openssl rand -base64 48)"
  REFRESH="$(openssl rand -base64 48)"
  # Update password in postgres to match .env
  sudo -u postgres psql -c "ALTER ROLE fca_lms WITH PASSWORD '$DB_PASS';"
  sed -i "s|CHANGE_ME_DB_PASSWORD|$DB_PASS|g" .env
  sed -i "s|CHANGE_ME_ACCESS_SECRET_MIN_32_CHARS____________|$ACCESS|g" .env
  sed -i "s|CHANGE_ME_REFRESH_SECRET_MIN_32_CHARS___________|$REFRESH|g" .env
  chmod 600 .env
fi

# Prisma CLI loads .env from packages/database — link monorepo root .env there.
ln -sfn "$LMS_ROOT/.env" "$LMS_ROOT/packages/database/.env"

# Quote URL values that contain & so bash `source` does not background them.
fix_env_quoting() {
  python3 - <<'PY' "$LMS_ROOT/.env"
from pathlib import Path
import sys
p = Path(sys.argv[1])
lines = p.read_text().splitlines()
out = []
for line in lines:
    if not line or line.lstrip().startswith("#") or "=" not in line:
        out.append(line)
        continue
    key, val = line.split("=", 1)
    key = key.strip()
    val = val.strip()
    if key in ("DATABASE_URL", "REDIS_URL", "MAIL_FROM") and not (
        (val.startswith("'") and val.endswith("'")) or (val.startswith('"') and val.endswith('"'))
    ):
        out.append(f"{key}='{val}'")
    else:
        out.append(line)
p.write_text("\n".join(out) + "\n")
PY
}

load_env() {
  fix_env_quoting
  set -a
  # shellcheck disable=SC1091
  source "$LMS_ROOT/.env"
  set +a
  if [[ -z "${DATABASE_URL:-}" ]]; then
    echo "ERROR: DATABASE_URL missing after sourcing $LMS_ROOT/.env"
    echo "Ensure DATABASE_URL is single-quoted (bash treats bare & as background)."
    exit 1
  fi
}

load_env

echo "==> Install + build (this takes several minutes)"
# .env sets NODE_ENV=production, which makes pnpm skip devDependencies
# (typescript/tsc lives there). Install with all deps, then restore production.
SAVED_NODE_ENV="${NODE_ENV:-production}"
unset NODE_ENV
pnpm install --frozen-lockfile
export NODE_ENV="$SAVED_NODE_ENV"

pnpm --filter @fca/shared build
pnpm --filter @fca/database build
pnpm --filter @fca/ai build
pnpm --filter @fca/analytics build
pnpm --filter @fca/ui build
pnpm --filter @fca/api build
pnpm --filter @fca/worker build
# Web needs public API URL baked at build time
export NEXT_PUBLIC_API_BASE_URL="${NEXT_PUBLIC_API_BASE_URL:-https://lms-api.futurecorpacademy.in/api/v1}"
pnpm --filter @fca/web build

echo "==> Migrate + RBAC (NO demo seed)"
# Re-load after long build so Prisma always sees DATABASE_URL
load_env
pnpm db:migrate:deploy
node deploy/seed-rbac.mjs

if [[ -n "${BOOTSTRAP_ADMIN_EMAIL:-}" && -n "${BOOTSTRAP_ADMIN_PASSWORD:-}" ]]; then
  node deploy/bootstrap-admin.mjs \
    --email "$BOOTSTRAP_ADMIN_EMAIL" \
    --password "$BOOTSTRAP_ADMIN_PASSWORD" \
    --first "${BOOTSTRAP_ADMIN_FIRST:-Admin}" \
    --last "${BOOTSTRAP_ADMIN_LAST:-User}"
else
  echo "Skip admin bootstrap — set BOOTSTRAP_ADMIN_EMAIL + BOOTSTRAP_ADMIN_PASSWORD to create one"
fi

echo "==> Nginx LMS sites (leave landing untouched)"
cp deploy/nginx-lms.conf /etc/nginx/sites-available/lms.futurecorpacademy.in
ln -sfn /etc/nginx/sites-available/lms.futurecorpacademy.in /etc/nginx/sites-enabled/lms.futurecorpacademy.in
nginx -t
systemctl reload nginx

echo "==> TLS (requires DNS pointed at this server)"
certbot --nginx -d lms.futurecorpacademy.in -d lms-api.futurecorpacademy.in --non-interactive --agree-tos \
  -m admin@futurecorpacademy.in --redirect || {
  echo "Certbot failed — check DNS A records, then re-run:"
  echo "  certbot --nginx -d lms.futurecorpacademy.in -d lms-api.futurecorpacademy.in"
}

echo "==> PM2 LMS processes (does not touch futurecorp-api)"
pm2 delete fca-lms-api fca-lms-web fca-lms-worker 2>/dev/null || true
load_env
pm2 start "$LMS_ROOT/deploy/ecosystem.config.cjs" --update-env
pm2 save
pm2 startup systemd -u root --hp /root >/dev/null || true

echo "==> Health checks"
sleep 3
curl -fsS "http://127.0.0.1:4001/health" || echo "API health failed"
curl -fsS "http://127.0.0.1:4001/health/ready" || echo "API ready failed (DB/Redis?)"
curl -fsS -o /dev/null -w "web:%{http_code}\n" "http://127.0.0.1:3000/" || true

echo ""
echo "DONE. Landing + api.futurecorpacademy.in unchanged."
echo "  LMS web: https://lms.futurecorpacademy.in"
echo "  LMS API: https://lms-api.futurecorpacademy.in/health"
echo "  PM2:     pm2 list   (futurecorp-api + fca-lms-*)"
