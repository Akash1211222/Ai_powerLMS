# Deploy FutureCorp LMS beside the existing landing page

## What stays untouched

| Existing | Path / process |
|---|---|
| Landing | `https://futurecorpacademy.in` → `/var/www/futurecorp` |
| Legacy blog/API | `https://api.futurecorpacademy.in` → PM2 `futurecorp-api` on **:4000** (`/root/futurecorp/backend`) |

## What gets added

| New | Port / host |
|---|---|
| LMS web | `https://lms.futurecorpacademy.in` → Next on **:3000** |
| LMS API | `https://lms-api.futurecorpacademy.in` → Nest on **:4001** |
| LMS worker | PM2 `fca-lms-worker` |
| Postgres DB | `fca_lms` (separate from anything else) |
| Redis DB index | `1` |

## Before you run

1. In Hostinger DNS, create **A records**:
   - `lms.futurecorpacademy.in` → `88.222.244.192`
   - `lms-api.futurecorpacademy.in` → `88.222.244.192`
2. Add this Mac’s SSH public key to the VPS (optional, for remote deploy):
   ```bash
   # On VPS web console:
   mkdir -p ~/.ssh && chmod 700 ~/.ssh
   echo 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIMZo8igsEsf4MeMNnjMWoeDXB0XvUlren/c27t3M2Ch8 akashpaul@Akashs-MacBook-Air-2.local' >> ~/.ssh/authorized_keys
   chmod 600 ~/.ssh/authorized_keys
   ```
3. Push this repo to GitHub `main` (or set `REPO_URL` / `BRANCH`).

## One-shot from VPS web console

```bash
# Optional: create admin during setup
export BOOTSTRAP_ADMIN_EMAIL='admin@futurecorpacademy.in'
export BOOTSTRAP_ADMIN_PASSWORD='ChooseAStrongPassword123!'

# Prefer cloning first so the script is the version you just shipped:
rm -rf /opt/fca-lms
git clone --depth 1 https://github.com/Akash1211222/Ai_powerLMS.git /opt/fca-lms
bash /opt/fca-lms/deploy/setup-lms-vps.sh
```

The setup script installs **Node 22+** and temporarily unsets `NODE_ENV` during
`pnpm install` so TypeScript (`tsc`) is available for the build. Do not export
`NODE_ENV=production` in the shell before running the script.

## Verify coexistence

```bash
pm2 list
# Expect: futurecorp-api AND fca-lms-api / fca-lms-web / fca-lms-worker

curl -I https://futurecorpacademy.in
curl -I https://api.futurecorpacademy.in
curl https://lms-api.futurecorpacademy.in/health
curl -I https://lms.futurecorpacademy.in
```

## Rollback LMS only

```bash
pm2 delete fca-lms-api fca-lms-web fca-lms-worker
rm -f /etc/nginx/sites-enabled/lms.futurecorpacademy.in
nginx -t && systemctl reload nginx
# Landing + futurecorp-api keep running
```
