# FutureCorp Academy — Architecture Overview

## Topology

```
                       ┌─────────────┐
   Browser  ────────▶  │  web (Next) │
                       └──────┬──────┘
                              │ REST / WS (later)
                       ┌──────▼──────┐        ┌───────────────┐
                       │  api (Nest) │──────▶ │ PostgreSQL     │
                       │  /api/v1    │        │ (Prisma)       │
                       └──┬───────┬──┘        └───────────────┘
                          │       │
             enqueue jobs │       │ cache / pubsub
                          ▼       ▼
                    ┌──────────┐  ┌──────────┐
                    │  Redis   │◀─│ worker   │  (BullMQ processors)
                    └──────────┘  └────┬─────┘
                                       │ provider abstractions
                    ┌──────────────────┼───────────────────┐
                    ▼                  ▼                    ▼
              S3 storage          AI provider          Email provider
             (MinIO/S3)        (Anthropic Claude)     (SMTP / SES)
```

## Bounded contexts (domain map)

`identity` · `org` (multi-tenant) · `ops` (audit/flags/settings) — **Phase 0.**
`academics` · `batches` · `live` · `attendance` · `assignments` · `assessments`
· `skills` · `intelligence` · `mentorship` · `placement` · `resume` ·
`interview` · `calendar` · `notifications` · `community` · `alumni` ·
`gamification` — later phases, each behind a feature flag until stable.

## Cross-cutting principles

- **Security**: permission-based authz checked server-side; helmet; CORS
  allowlist; env-validated secrets; argon2 password hashing; audit logging.
- **Validation**: zod/DTO validation at every boundary; typed error envelope.
- **Observability**: `/health` (liveness) and `/health/ready` (DB+Redis
  readiness); structured logs; request IDs (added with the logging middleware).
- **Jobs**: idempotent BullMQ processors; graceful shutdown.
- **AI**: deterministic scores computed in app logic; AI only interprets, via a
  provider interface returning schema-validated structured output.

## Phase 0 status

Implemented: monorepo tooling, Docker infra (Postgres/Redis/MinIO/Mailhog),
env validation, Prisma schema for identity/org/ops, health/readiness endpoints,
worker skeleton, design-system Tailwind preset + web shell.

Next (M0.2–M0.7): migrations + seed run, authentication, authorization guards,
API standards (error filter, request IDs, audit), web auth pages, CI gate.
