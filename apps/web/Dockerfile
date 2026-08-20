# Build context is the repo root (not apps/web) -- this is a pnpm/Turborepo
# monorepo, and `turbo prune` needs the whole workspace to compute a minimal,
# correctly-scoped subset for this one app. Build with:
#   docker build -f apps/web/Dockerfile -t <tag> .
# from the repo root, not from inside apps/web.

FROM node:24-alpine AS base

# --- Prune: compute the minimal workspace subset @prometheus/web needs ---
FROM base AS pruner
WORKDIR /app
RUN npm install -g turbo@^2.3.0
COPY . .
RUN turbo prune @prometheus/web --docker

# --- Install: only the pruned package.json files, so this layer caches
#     until dependencies actually change, not on every source edit ---
FROM base AS installer
WORKDIR /app
RUN npm install -g pnpm@10.24.0
COPY --from=pruner /app/out/json/ .
RUN pnpm install --frozen-lockfile

# --- Build: full pruned source on top of the installed deps ---
FROM base AS builder
WORKDIR /app
RUN npm install -g pnpm@10.24.0 turbo@^2.3.0
COPY --from=installer /app/ .
COPY --from=pruner /app/out/full/ .
# turbo prune --docker's out/full/ only contains files inside workspace
# package directories -- it does not pick up root-level config files like
# tsconfig.base.json that packages reach via "extends", so copy it in
# explicitly from the build context (repo root) or `next build` fails with
# TS5083 (cannot read tsconfig.base.json).
COPY tsconfig.base.json ./tsconfig.base.json
RUN turbo run build --filter=@prometheus/web

# --- Runtime: Next.js standalone output only -- no monorepo tooling, no
#     dev dependencies, non-root user ---
FROM base AS runner
WORKDIR /app
RUN addgroup -S nodejs && adduser -S nextjs -G nodejs
USER nextjs

COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
# No apps/web/public directory exists in this app (no static assets committed).

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

CMD ["node", "apps/web/server.js"]
