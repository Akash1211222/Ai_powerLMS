# syntax=docker/dockerfile:1
#
# @fca/api production image. Build from the REPOSITORY ROOT, not this folder:
#   docker build -f apps/api/Dockerfile -t fca-api .
#
# The API is a pnpm workspace member that depends on @fca/shared, @fca/database
# (Prisma), @fca/ai and @fca/analytics, so the whole workspace has to be present
# at build time even though only this app is served at runtime.

FROM node:22-bookworm-slim AS base
# Prisma's query engine needs OpenSSL; the slim image doesn't ship it.
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /app
ENV CI=true

# --- dependencies -----------------------------------------------------------
# Copied separately from source so a code-only change doesn't reinstall.
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

# --- build ------------------------------------------------------------------
FROM deps AS build
COPY . .
# Generates the Prisma client into node_modules, then compiles the workspace
# libraries the API imports, then the API itself.
RUN pnpm --filter @fca/shared build \
    && pnpm --filter @fca/database build \
    && pnpm --filter @fca/ai build \
    && pnpm --filter @fca/analytics build \
    && pnpm --filter @fca/api exec tsc -p tsconfig.json
# Drop dev dependencies now that everything is compiled. The generated Prisma
# client lives in node_modules/.prisma and survives this.
RUN pnpm prune --prod

# --- runtime ----------------------------------------------------------------
FROM base AS runtime
ENV NODE_ENV=production
# Never run as root.
RUN groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs nodeapp

COPY --from=build --chown=nodeapp:nodejs /app/node_modules ./node_modules
COPY --from=build --chown=nodeapp:nodejs /app/package.json ./package.json
COPY --from=build --chown=nodeapp:nodejs /app/packages ./packages
COPY --from=build --chown=nodeapp:nodejs /app/apps/api/dist ./apps/api/dist
COPY --from=build --chown=nodeapp:nodejs /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build --chown=nodeapp:nodejs /app/apps/api/package.json ./apps/api/package.json

USER nodeapp
WORKDIR /app/apps/api
EXPOSE 4000

# Liveness is deliberately dependency-free; readiness (/health/ready) checks
# Postgres and Redis and belongs in the orchestrator's readiness probe.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.API_PORT||4000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# `--init` (or an orchestrator that reaps PID 1) is recommended so SIGTERM
# reaches Node and Nest's shutdown hooks run.
CMD ["node", "dist/main.js"]
