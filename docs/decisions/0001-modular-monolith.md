# ADR 0001 — Modular monolith with NestJS + Next.js monorepo

- Status: Accepted
- Date: 2026-07-09

## Context

FutureCorp Academy is a large, multi-domain platform (LMS + intelligence +
career + community) that must eventually scale to thousands of concurrent
students and multiple tenants. The master spec (§2) mandates a modular
architecture, secure-by-default posture, event-driven cross-module workflows,
and the ability to later extract high-load modules (video, live class, AI,
notifications, analytics, search, chat) into independent services.

The repository was greenfield: only static design mockups existed. Git was
misconfigured (rooted at the user's home directory).

## Decision

1. **Fresh, isolated git repository** rooted at the project directory.
2. **Modular monolith**, not microservices, initially (§2). Clear domain
   boundaries so extraction is possible later.
3. **Monorepo** with pnpm workspaces + Turborepo.
   - `apps/api` — NestJS REST API + WebSocket gateway (later) + OpenAPI.
   - `apps/web` — Next.js App Router frontend.
   - `apps/worker` — BullMQ background workers.
   - `packages/*` — `shared`, `database` (Prisma), `config`, and future
     `ui`, `auth`, `ai`, `events`, `analytics`.
4. **PostgreSQL + Prisma** for data; **Redis + BullMQ** for cache/jobs;
   **S3-compatible** storage; **provider abstractions** for AI, video, email.
5. **Permission-based authorization** (not role-name checks), enforced
   server-side on every protected endpoint.

## Consequences

- One deployable API today, but code is organized by bounded context so a
  module can become its own service without a rewrite.
- Shared types (roles, permissions, error envelope) live in `@fca/shared`,
  consumed by API, worker, and web — one source of truth.
- Slightly more upfront tooling (workspace wiring) in exchange for consistent
  builds, caching, and type sharing.

## Alternatives considered

- **Next.js full-stack only** — simpler ops, but strains under live-class,
  video-processing, and real-time load; rejected per the scale requirements.
- **Microservices from day one** — explicitly discouraged by §2; premature.
