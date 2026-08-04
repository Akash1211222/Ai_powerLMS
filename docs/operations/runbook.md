# Operations Runbook

Everything an on-call operator needs to run FutureCorp Academy in production.

## Topology

| Service | Image | Port | Scales |
|---|---|---|---|
| `api` | `apps/api/Dockerfile` | 4000 | Horizontally — stateless |
| `web` | `apps/web/Dockerfile` | 3000 | Horizontally — stateless |
| `worker` | `apps/worker/Dockerfile` | — | **Vertically only** (see below) |
| PostgreSQL 16 | managed | 5432 | — |
| Redis 7 | managed | 6379 | — |

All three app images build from the **repository root**:

```bash
docker build -f apps/api/Dockerfile    -t fca-api    .
docker build -f apps/worker/Dockerfile -t fca-worker .
docker build -f apps/web/Dockerfile    -t fca-web    . \
  --build-arg NEXT_PUBLIC_API_URL=https://api.example.com/api/v1
```

Run with `--init` (or an orchestrator that reaps PID 1) so `SIGTERM` reaches
Node and Nest's shutdown hooks drain in-flight work.

> **Worker scaling caveat.** The worker registers repeatable BullMQ jobs (the
> nightly risk sweep, the Monday weekly-report fan-out). Running multiple
> replicas is safe for *correctness* — every job is idempotent — but the
> repeatable schedules are registered per instance. Until that moves behind a
> leader election, run **one** worker replica and scale it vertically.

## Configuration

The API validates its environment at boot and **refuses to start** on anything
missing or malformed (`apps/api/src/config/env.ts`). Fail-fast is intentional:
a misconfigured API should never accept traffic.

### Required

| Variable | Notes |
|---|---|
| `DATABASE_URL` | Postgres connection string |
| `REDIS_URL` | Redis connection string |
| `JWT_ACCESS_SECRET` | **≥ 32 chars.** Rotating invalidates all access tokens |
| `JWT_REFRESH_SECRET` | **≥ 32 chars.** Rotating signs every user out |

### Important defaults

| Variable | Default | Notes |
|---|---|---|
| `NODE_ENV` | `development` | **Set to `production`.** Also gates API docs |
| `CORS_ORIGINS` | `http://localhost:3000` | Comma-separated allowlist. Set to the real web origin |
| `API_BASE_URL` | `http://localhost:4000` | Used in outbound links |
| `SWAGGER_ENABLED` | off in production | The schema maps the whole attack surface — opt in deliberately |
| `RATE_LIMIT_ENABLED` | `true` | Leave on |
| `RATE_LIMIT_MAX` | `300` / window | General per-IP budget |
| `AUTH_RATE_LIMIT_MAX` | `10` / window | Unauthenticated auth routes |
| `RATE_LIMIT_TTL_SECONDS` | `60` | Window length |
| `BODY_LIMIT` | `1mb` | Max request body |
| `LOGIN_MAX_ATTEMPTS` | `5` | Per-account lockout threshold |
| `LOGIN_LOCKOUT_MINUTES` | `15` | Lockout duration |
| `ANTHROPIC_API_KEY` | unset | **Unset ⇒ the deterministic heuristic provider is used.** Set to enable real AI narration |

Rate limiting keys on the client IP resolved via `trust proxy`, so the load
balancer **must** set `X-Forwarded-For` or every client shares one bucket.

## Probes

| Probe | Endpoint | Checks |
|---|---|---|
| Liveness | `GET /health` | Process only. Never throttled |
| Readiness | `GET /health/ready` | Postgres **and** Redis |

Use liveness for restarts and readiness for traffic gating. Wiring readiness to
the restart probe will cause restart loops during a brief database blip.

## Deploying

Migrations are **not** run by the app at boot — that would race across replicas.
Run them as a release step before rolling out new pods:

```bash
pnpm db:migrate:deploy     # prisma migrate deploy — forward-only, idempotent
```

1. Run migrations (backward-compatible ones first; see below).
2. Roll out `api` and `worker`.
3. Roll out `web`.

**Expand/contract for breaking schema changes:** deploy the additive migration,
roll out code that writes both shapes, backfill, then remove the old column in a
later release. A migration that drops a column in the same release as the code
change will break in-flight requests on the old replicas.

### Rolling back

Prisma migrations are forward-only. To undo a schema change, write a new
migration that reverses it. Roll application images back independently — they
are decoupled from the schema as long as you followed expand/contract.

## Backup and restore

Nightly logical backup, retained 30 days, stored off-host:

```bash
pg_dump --format=custom --no-owner --no-privileges "$DATABASE_URL" \
  > "fca-$(date -u +%Y%m%dT%H%M%SZ).dump"
```

Restore into an empty database:

```bash
createdb fca_restore
pg_restore --no-owner --dbname="$RESTORE_URL" fca-<timestamp>.dump
```

**A backup you have never restored is not a backup.** Rehearse the restore on a
scratch database at least quarterly and record how long it took — that number is
your real RTO.

Redis holds queues and ephemeral state only. Losing it drops queued jobs; it
does not lose durable data. Every job is idempotent, so re-enqueueing is safe.

## Common incidents

**Boot fails with "Invalid environment configuration"** — a required variable is
missing or a JWT secret is under 32 chars. The message names the exact keys.

**Everything returns 429** — either `RATE_LIMIT_MAX` is too low for real traffic,
or the load balancer isn't forwarding `X-Forwarded-For`, so all clients collapse
into one bucket. Confirm by checking whether the limit trips at the same rate
regardless of client count.

**One user cannot log in, everyone else can** — per-account lockout after
`LOGIN_MAX_ATTEMPTS` failures. It clears itself after `LOGIN_LOCKOUT_MINUTES`.
Note the account lockout and the rate limiter both answer **429**; the response
body distinguishes them ("Too many failed login attempts" vs. the limiter's).

**Readiness failing, liveness fine** — Postgres or Redis is unreachable. Check
`/health/ready`, which names the failing dependency.

**AI output looks generic/templated** — `ANTHROPIC_API_KEY` is unset, so the
heuristic provider is running. That is a deliberate, working fallback, not a
failure: every stored record is labelled with the provider that produced it.

**Background work stopped** — check the worker is running and Redis is
reachable. The nightly sweep runs at 02:00 and weekly reports Monday 06:00.

## Security posture

- Helmet security headers; CORS restricted to an explicit allowlist.
- Argon2 password hashing; refresh tokens stored **hashed**, never in plaintext.
- Per-IP rate limiting plus per-account login lockout.
- RBAC enforced server-side on every endpoint — the web app's checks are UX only.
- Multi-tenant reads are org-scoped in the service layer, not just the UI.
- Audit log for sensitive actions (`audit_logs`).
- API docs disabled in production by default.

## Known gaps

Honest list of what is **not** hardened yet:

- **No centralised log aggregation or error tracking.** Logs go to stdout; there
  is no Sentry-equivalent. This is the biggest observability gap.
- **No metrics/tracing** (no Prometheus endpoint, no OpenTelemetry).
- **Worker is single-replica** by design (see above).
- **Container images are not size-optimised** — the API and worker images ship
  the pruned workspace rather than a minimal deploy bundle.
- **No automated backup verification** — the restore drill is manual.
- **CSP is not tightened** on the web app (noted in `next.config.mjs`).
