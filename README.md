# FutureCorp Academy

AI-powered Learning, Student Intelligence, Mentorship, Career, Placement and
Community Operating System.

A modular monolith: **Next.js** web + **NestJS** API + **BullMQ** worker, over
**PostgreSQL** (Prisma) and **Redis**, in a **pnpm + Turborepo** monorepo.

> Status: **Phase 0 — Foundation** (see `docs/architecture/overview.md`).

## Repository layout

```
apps/
  api/      NestJS REST API + OpenAPI (health/readiness live now)
  web/      Next.js App Router frontend (design system wired)
  worker/   BullMQ background workers (skeleton)
packages/
  shared/   roles, permissions, error envelope, shared types
  database/ Prisma schema + client + seed (identity/org/ops)
  config/   shared ESLint, Tailwind preset (design tokens), tsconfig
infrastructure/ (docker compose at repo root for local dev)
docs/       architecture, decisions (ADRs)
_design_src/ approved UI mockups — reference only, not built
```

## Prerequisites

- Node 22+ (`.nvmrc`)
- pnpm 9+ (`corepack enable && corepack prepare pnpm@9.12.0 --activate`)
- Docker (for local Postgres/Redis/MinIO/Mailhog)

## Quick start

```bash
# 1. Install
pnpm install

# 2. Configure environment
cp .env.example .env       # then fill JWT secrets: openssl rand -base64 48

# 3. Start local infrastructure
pnpm infra:up              # postgres, redis, minio, mailhog

# 4. Database: generate client, migrate, seed dev data
pnpm db:generate
pnpm db:migrate
pnpm db:seed

# 5. Run everything (api + web + worker)
pnpm dev
```

- Web: http://localhost:3000
- API: http://localhost:4000 · Docs: http://localhost:4000/api/docs
- Health: http://localhost:4000/health · Ready: http://localhost:4000/health/ready
- MinIO console: http://localhost:9001 · Mailhog: http://localhost:8025

### Dev seed accounts

One account per role, all with password `Password123!` (development only —
never used in production). See `packages/database/prisma/seed.ts`.
`superadmin@futurecorpacademy.in`, `trainer@…`, `student@…`, etc.

## Commands

| Command | Description |
| --- | --- |
| `pnpm build` | Build all packages/apps (Turbo) |
| `pnpm dev` | Run api + web + worker in watch mode |
| `pnpm typecheck` | Type-check all workspaces |
| `pnpm lint` | Lint all workspaces |
| `pnpm test` | Run unit tests |
| `pnpm db:migrate` | Create/apply a dev migration |
| `pnpm db:seed` | Seed development data |
| `pnpm db:studio` | Open Prisma Studio |
| `pnpm infra:up` / `infra:down` | Start/stop local Docker services |

## Security & conventions

- Authorization is **permission-based** and enforced **server-side**.
- Secrets come only from the environment; the API fails fast on invalid config.
- Never commit `.env`. `_design_src/` and the design zip are git-ignored.
