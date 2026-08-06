# FutureCorp Academy — AI-Powered LMS

Multi-role Learning Management System for colleges and training academies: courses, batches, AI code assignments with in-browser compilers, assessments, attendance, student intelligence, mentorship, placements, career tools, alumni, and community.

Built as a **modular monolith**: Next.js web + NestJS API + BullMQ worker, over PostgreSQL (Prisma) and Redis, in a **pnpm + Turborepo** monorepo.

**Repository:** [github.com/Akash1211222/Ai_powerLMS](https://github.com/Akash1211222/Ai_powerLMS)

---

## What's included

| Area | Capabilities |
| --- | --- |
| **Learning** | Courses, modules/lessons, batches, enrollments, calendar |
| **Assignments** | AI-generated language-specific tasks, CodeMirror workspace, Run Code (JS/TS/Python/Java/C/C++/HTML/SQL), instant AI scoring |
| **Assessments** | Quizzes/tests with results and role dashboards |
| **Attendance** | Marking, history, trends on student dashboard |
| **Student Intelligence** | Risk scores, explainable insights, interventions |
| **Mentorship** | Mentor directory, 1:1 session booking |
| **Placements** | Job opportunities, applications, college placement portal |
| **Career & skills** | Skill profiles, recommendations, career paths |
| **Alumni & community** | Alumni surfaces, forums/community |
| **Admin** | Feature flags, users/roles, reports, analytics |

### Roles (permission-based, enforced server-side)

`SUPER_ADMIN` · `COLLEGE_ADMIN` · `BATCH_MANAGER` · `TRAINER` · `MENTOR` · `PLACEMENT_OFFICER` · `RECRUITER` · `ALUMNI` · `STUDENT`

Each role gets a tailored dashboard and navigation.

---

## Repository layout

```
apps/
  api/          NestJS REST API (OpenAPI at /api/docs)
  web/          Next.js 15 App Router frontend
  worker/       BullMQ workers (AI evaluation, background jobs)
packages/
  shared/       Roles, permissions, error envelope, shared types
  database/     Prisma schema, migrations, seed
  ai/           AI providers, assignment generation & evaluation, insights
  analytics/    Analytics helpers
  ui/           Shared UI primitives
  config/       ESLint, Tailwind preset (FutureCorp tokens), tsconfig
docs/           Architecture overview and ADRs
docker-compose.yml   Local Postgres, Redis, MinIO, Mailhog
```

---

## Prerequisites

- **Node.js 22+** (see `.nvmrc`)
- **pnpm 9+** — `corepack enable && corepack prepare pnpm@9.12.0 --activate`
- **Docker Desktop** — for Postgres, Redis, MinIO, Mailhog
- Optional: **Gemini** or **Anthropic** API key for live AI generation/scoring (heuristic fallbacks work without it)
- Optional for code runtimes on the API host: `node`, `python3`, `javac`/`java`, `gcc`/`g++` (missing tools return a clear error for that language)

---

## Quick start

```bash
# 1. Clone
git clone https://github.com/Akash1211222/Ai_powerLMS.git
cd Ai_powerLMS

# 2. Install dependencies
pnpm install

# 3. Environment
cp .env.example .env
# Set JWT secrets (required):
#   openssl rand -base64 48
# Optionally set ANTHROPIC_API_KEY for live AI

# 4. Infrastructure
pnpm infra:up

# 5. Database
pnpm db:generate
pnpm db:migrate
pnpm db:seed

# 6. Run API + Web + Worker
pnpm dev
```

| Service | URL |
| --- | --- |
| Web | http://localhost:3000 |
| API | http://localhost:4000 |
| OpenAPI docs | http://localhost:4000/api/docs |
| Health | http://localhost:4000/health |
| MinIO console | http://localhost:9001 |
| Mailhog | http://localhost:8025 |

> **Tip:** The `dev` scripts load the repo-root `.env` themselves (via `dotenv-cli`), so `pnpm dev` and `pnpm --filter @fca/api dev` both pick up `DATABASE_URL`, JWT secrets, and Redis with no shell setup. Production entrypoints (`start`, `start:prod`) still read the real environment only.

> **Note:** Keep this repo out of an iCloud-synced folder (Desktop/Documents). iCloud evicts rarely-read files, and `node_modules` source maps then take ~1s each to fault back in — enough to stall a Node process that reads them at boot.

---

## Demo accounts

Seeded for local development only. Password for all: **`Password123!`**

| Role | Email |
| --- | --- |
| Super Admin | `superadmin@futurecorpacademy.in` |
| College Admin | `collegeadmin@futurecorpacademy.in` |
| Batch Manager | `batchmanager@futurecorpacademy.in` |
| Trainer | `trainer@futurecorpacademy.in` |
| Mentor | `mentor@futurecorpacademy.in` |
| Placement Officer | `placement@futurecorpacademy.in` |
| Recruiter | `recruiter@futurecorpacademy.in` |
| Alumni | `alumni@futurecorpacademy.in` |
| Student | `student@futurecorpacademy.in` |

See `packages/database/prisma/seed.ts` for full seed data (courses, assignments with starter code, placements, mentorship, feature flags).

---

## AI code assignments

1. **Auto-generate** — On batch enrollment (or via trainer `POST /assignments/ai-generate`), the system creates language-specific assignments from the enrolled course (JS/TS/Python/Java/C/C++/HTML/SQL).
2. **In-browser workspace** — CodeMirror editor + language-colored UI; students edit starter code and run it.
3. **Run Code** — `POST /code/run` executes on the API host (local sandboxed runners; not the public Piston API).
4. **Submit & score** — Submission triggers AI evaluation (Anthropic when configured, otherwise heuristics). High-confidence scores can auto-release to the student; trainers see scores in the assignment detail view.
5. **Performance** — Scores feed dashboards and student intelligence signals.

Feature flags (seeded): `module.placement`, `module.intelligence`, `module.mentorship`, and related LMS modules.

---

## Common commands

| Command | Description |
| --- | --- |
| `pnpm dev` | Run api + web + worker (Turbo) |
| `pnpm build` | Build all workspaces |
| `pnpm typecheck` | Type-check all workspaces |
| `pnpm lint` | Lint all workspaces |
| `pnpm test` | Unit tests |
| `pnpm db:generate` | Generate Prisma client |
| `pnpm db:migrate` | Apply/create migrations (dev) |
| `pnpm db:migrate:deploy` | Deploy migrations (CI/prod) |
| `pnpm db:seed` | Seed development data |
| `pnpm db:seed:demo` | Richer demo seed + intelligence recompute |
| `pnpm db:studio` | Prisma Studio |
| `pnpm infra:up` / `infra:down` | Start/stop Docker services |

---

## Architecture notes

- **Auth:** JWT access + refresh; Argon2id passwords; login lockout; permission checks on every protected API route.
- **API:** NestJS modular monolith under `apps/api/src/*` (auth, courses, batches, assignments, code, assessments, attendance, intelligence, mentorship, placement, career, community, admin, …).
- **Web:** App Router under `apps/web` with role-aware shell and FutureCorp-inspired UI (Manrope / Space Grotesk, navy–blue–orange tokens in `packages/config/tailwind`).
- **Jobs:** BullMQ on Redis via `apps/worker` for async AI evaluation and related work.
- **Data:** Prisma schema + numbered migrations in `packages/database/prisma`.
- **Docs:** `docs/architecture/overview.md` and `docs/decisions/` (ADRs).

---

## Security & conventions

- Authorization is **permission-based** and enforced **only on the server**.
- Secrets come from the environment; never commit `.env`.
- Design mockups (`_design_src/`, `FutureCorp Academy UI Design.zip`) are git-ignored — reference only.
- Redis dump files (`dump.rdb`) and local build artifacts must not be committed.

---

## License / status

Private development project for FutureCorp Academy. Core LMS, placement, intelligence, mentorship, and AI code-assignment flows are implemented for local/demo use. Production hardening (secrets management, sandbox isolation for code execution, observability, SSO) should be completed before any public deploy.
