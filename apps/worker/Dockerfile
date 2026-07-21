# syntax=docker/dockerfile:1
#
# @fca/worker production image. Build from the REPOSITORY ROOT:
#   docker build -f apps/worker/Dockerfile -t fca-worker .
#
# The worker consumes BullMQ queues (AI evaluation, the nightly risk sweep and
# the weekly report fan-out), so it needs the same Prisma client and analytics
# packages as the API but serves no HTTP traffic.

FROM node:22-bookworm-slim AS base
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /app
ENV CI=true

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY apps/worker/package.json apps/worker/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
COPY packages/database/package.json packages/database/
COPY packages/config/package.json packages/config/
COPY packages/ui/package.json packages/ui/
COPY packages/ai/package.json packages/ai/
COPY packages/analytics/package.json packages/analytics/
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
RUN pnpm --filter @fca/shared build \
    && pnpm --filter @fca/database build \
    && pnpm --filter @fca/ai build \
    && pnpm --filter @fca/analytics build \
    && pnpm --filter @fca/worker build
RUN pnpm prune --prod

FROM base AS runtime
ENV NODE_ENV=production
RUN groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs nodeapp

COPY --from=build --chown=nodeapp:nodejs /app/node_modules ./node_modules
COPY --from=build --chown=nodeapp:nodejs /app/package.json ./package.json
COPY --from=build --chown=nodeapp:nodejs /app/packages ./packages
COPY --from=build --chown=nodeapp:nodejs /app/apps/worker/dist ./apps/worker/dist
COPY --from=build --chown=nodeapp:nodejs /app/apps/worker/node_modules ./apps/worker/node_modules
COPY --from=build --chown=nodeapp:nodejs /app/apps/worker/package.json ./apps/worker/package.json

USER nodeapp
WORKDIR /app/apps/worker

# No HTTP surface, so no HEALTHCHECK: liveness is "the process is running and
# its BullMQ workers are connected", which the orchestrator sees via restarts.
CMD ["node", "dist/main.js"]
