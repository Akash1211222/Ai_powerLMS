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

1. Create the **A records — in GoDaddy, not Hostinger.** `futurecorpacademy.in`
   delegates to `ns29.domaincontrol.com` / `ns30.domaincontrol.com`, so records
   added in Hostinger's zone editor are ignored. GoDaddy → *My Products* →
   `futurecorpacademy.in` → **DNS**:

   | Type | Name | Value |
   |---|---|---|
   | A | `lms` | `88.222.244.192` |
   | A | `lms-api` | `88.222.244.192` |

   Enter the **bare subdomain** in Name (`lms`), not the FQDN — GoDaddy appends
   the domain itself. Verify before running certbot, which fails with NXDOMAIN
   if the records are missing:

   ```bash
   dig +short lms.futurecorpacademy.in A @1.1.1.1
   dig +short lms-api.futurecorpacademy.in A @1.1.1.1
   ```
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
# Optional: create admin during setup. Prompt for the password rather than
# typing it inline — a pasted placeholder becomes a real SUPER_ADMIN password,
# and an inline one is left behind in shell history.
export BOOTSTRAP_ADMIN_EMAIL='admin@futurecorpacademy.in'
read -rsp 'Admin password (min 10 chars): ' BOOTSTRAP_ADMIN_PASSWORD && echo
export BOOTSTRAP_ADMIN_PASSWORD

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

## Continuous deployment (pull-based)

Push to `main` → CI runs → the VPS notices and deploys itself. Nothing to run
by hand, and **no inbound connection is required**.

```
push main ──► GitHub Actions (quality + integration + images)
                     │
   VPS timer ────────┘  every 2 min:  git ls-remote → new SHA?
                                      → GitHub API → checks green?
                                      → deploy/deploy.sh
```

`deploy/poll-deploy.sh` runs from `fca-lms-deploy.timer`. It only makes
**outbound** HTTPS calls, which is the whole point: GitHub-hosted runners are
intermittently unable to reach this box at all — sshd logs no connection
attempt and port 443 times out from the same runner — so a whole runner IP is
being filtered upstream. Retrying from CI did not help. Polling sidesteps it.

The CI gate is preserved: a commit is only deployed once the GitHub API says
its check runs are green. Anything else (pending, failed, unreadable) means no
deploy this tick, and a failed SHA is recorded so it is judged once rather than
re-queried every two minutes.

### Watching and controlling it

```bash
journalctl -u fca-lms-deploy -f        # live deploy log
systemctl list-timers fca-lms-deploy   # when it next fires
systemctl start fca-lms-deploy         # deploy right now, don't wait
systemctl disable --now fca-lms-deploy.timer   # pause auto-deploys
```

### Installing the timer (once)

```bash
install -m 755 /opt/fca-lms/deploy/poll-deploy.sh /usr/local/bin/fca-lms-poll-deploy
install -m 644 /opt/fca-lms/deploy/fca-lms-deploy.service /etc/systemd/system/
install -m 644 /opt/fca-lms/deploy/fca-lms-deploy.timer   /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now fca-lms-deploy.timer
```

The poller is installed to `/usr/local/bin`, **outside** the repo, and the
service runs it from there. Running it from the working tree would mean a
deploy moving `HEAD` swaps the script out mid-run, and bash reads scripts
incrementally. After each successful deploy the poller refreshes that installed
copy (and the units) from the repo via an atomic rename, so changes to the
deploy machinery ship like any other commit.

### How the landing page stays safe

`deploy/deploy.sh` is the only thing CI can execute on the box, and it is
scoped to the LMS by construction:

- **Restricted key.** The deploy key is pinned to a forced command in
  `authorized_keys`, so it can *only* run `deploy.sh` — a leaked key cannot run
  arbitrary commands. Verified: asking it to `cat /etc/shadow` runs the deploy.
- **No system-level commands.** Never invokes `apt-get`, `certbot`, `nginx`,
  or `systemctl`. TLS and vhosts are set up once and left alone.
- **Named processes only.** Never `pm2 restart all`. Only `fca-lms-api`,
  `fca-lms-web`, `fca-lms-worker`.
- **Capped build.** 1 vCPU / 3.8 G box, so the build runs in a systemd scope
  with `MemoryMax=1800M`, `CPUWeight=20`, `nice -19`. A runaway build is
  OOM-killed *inside its own cgroup* rather than letting the kernel pick
  `futurecorp-api` as a victim.
- **Build before restart.** Install, build and migrate all finish before any
  process is touched, so a failed build leaves the running version serving.
- **Proof, not assumption.** The `futurecorp-api` restart counter is sampled
  before and after every deploy and printed. If it ever changes, the deploy
  log says so loudly.
- **Docs-only changes** skip install, build and restart entirely.

CI then verifies `lms.`, `lms-api.`, the landing page and `www.` from outside.

### Roll back a bad deploy

```bash
cd /opt/fca-lms
git checkout -B main <last-good-sha>
bash deploy/deploy.sh
```

Migrations are forward-only and are **not** reverted — check the diff before
rolling back across one.

## Rollback LMS only

```bash
pm2 delete fca-lms-api fca-lms-web fca-lms-worker
rm -f /etc/nginx/sites-enabled/lms.futurecorpacademy.in
nginx -t && systemctl reload nginx
# Landing + futurecorp-api keep running
```
