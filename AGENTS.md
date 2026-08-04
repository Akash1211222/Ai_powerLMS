# AGENTS.md

## Cursor Cloud specific instructions

FutureCorp Academy is a **pnpm + Turborepo** monorepo (one product, three runnable
apps): `apps/api` (NestJS REST API, port 4000), `apps/web` (Next.js, port 3000),
and `apps/worker` (BullMQ background jobs, no HTTP port). It is backed by
**PostgreSQL 16** and **Redis 7**. Standard commands live in the root `README.md`
and `package.json` scripts — prefer those; the notes below only cover non-obvious
cloud/setup caveats.

### Backing services (must be started each session)

The update script only refreshes code dependencies. Postgres and Redis are
installed at the system level but are **not** started automatically (no systemd in
this VM). Start them before doing anything that touches the DB/queues:

```bash
sudo pg_ctlcluster 16 main start   # PostgreSQL 16 on :5432
sudo redis-server --daemonize yes  # Redis on :6379
```

`docker` is not installed, so `pnpm infra:up` (the README's Docker path) does
**not** work here. MinIO and Mailhog are optional and are not provided; the app
runs fine without them (email is best-effort, storage is not yet wired in).

Postgres role/db (matches `.env` / `docker-compose.yml` defaults): role `fca`
(password `fca_dev_password`), databases `fca` (dev) and `fca_test` (tests). The
`fca` role has `CREATEDB` — this is **required** for `prisma migrate dev`, which
creates a shadow database.

### Environment variables (important gotcha)

There is **no dotenv loader** in the app/CLI code — every process (Prisma, Nest,
Next, worker) reads from `process.env` directly. The root `.env` file is present
but is not auto-loaded. Always export it into your shell first:

```bash
set -a; . ./.env; set +a
```

Do this in any shell that runs Prisma commands, tests, or the dev servers.
If `.env` is ever missing, recreate it with `cp .env.example .env` and set real
`JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` (min 32 chars, e.g. `openssl rand -base64 48`).

### First-run build + DB prep (after starting services, env exported)

Internal workspace libraries publish from `dist/`, so they must be built before
seeding or running (the seed imports `@fca/shared/dist`):

```bash
pnpm --filter @fca/shared build && pnpm --filter @fca/database build \
  && pnpm --filter @fca/ai build && pnpm --filter @fca/analytics build
pnpm db:migrate   # or db:migrate:deploy for an already-migrated db
pnpm db:seed      # 9 seed users, all password: Password123!
```

Seed login accounts (dev only): `student@futurecorpacademy.in`,
`trainer@…`, `superadmin@…`, etc. — all with password `Password123!`.

### Running the apps (dev)

Export `.env` first (see above). Running each app individually is verified to work
and guarantees every env var reaches the process:

```bash
pnpm --filter @fca/api dev      # http://localhost:4000  (docs at /api/docs)
pnpm --filter @fca/web dev      # http://localhost:3000
pnpm --filter @fca/worker dev
```

`pnpm dev` runs all three at once via Turbo. Note Turbo only forwards the env vars
declared in `turbo.json` `globalEnv` (DB/Redis/JWT); vars like
`NEXT_PUBLIC_API_BASE_URL` and `CORS_ORIGINS` are not declared, so the per-app
commands above are the reliable way to run the full browser stack.

Readiness check: `curl localhost:4000/health/ready` should report database and
redis `up`.

### Tests

- `pnpm test` — unit tests only (Turbo). The API integration/e2e specs are
  **skipped** unless `TEST_DATABASE_URL` is set.
- Full API integration + e2e suite (matches CI) needs a migrated+seeded test DB
  and must be run directly (not through Turbo, which would strip
  `TEST_DATABASE_URL`):

```bash
export TEST_DATABASE_URL="postgresql://fca:fca_dev_password@localhost:5432/fca_test?schema=public"
# one-time: create fca_test, then: DATABASE_URL=$TEST_DATABASE_URL pnpm db:migrate:deploy && pnpm db:seed
pnpm --filter @fca/api test
```
