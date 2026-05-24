# Build context: monorepo root (for workspace dependencies)
# Build with: docker compose -f docker-compose.prod.yml build customer-web

# Stage 1: Install dependencies
#
# Copy ONLY the workspace package.json files customer-web actually consumes:
# - root  (turbo, overrides)
# - shared, packages/ui   (workspace symlinks the app imports from)
# - apps/customer-web     (the app itself)
#
# The previous "copy ALL workspaces" version triggered npm's hoisting to
# selectively skip react/react-dom (probably interacting with @aks/ui's
# react peer dep). Scoping the install via `--workspace=...` matches the
# admin Dockerfile's pattern (which works) and keeps the dep graph tight.
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
COPY shared/package.json ./shared/
COPY packages/ui/package.json ./packages/ui/
COPY apps/customer-web/package.json ./apps/customer-web/
RUN npm install --legacy-peer-deps \
    --workspace=apps/customer-web \
    --workspace=packages/ui \
    --workspace=shared \
    --include-workspace-root

# Stage 2: Local development (hot reload via volume mount)
FROM deps AS dev
WORKDIR /app
COPY shared ./shared
COPY packages/ui ./packages/ui
COPY apps/customer-web ./apps/customer-web
WORKDIR /app/apps/customer-web
EXPOSE 3000
CMD ["npm", "run", "dev"]

# Stage 3: Build
FROM deps AS builder
# NEXT_PUBLIC_* vars are inlined into the client bundle at build time, so the
# API URL must be present during `next build` — passed as a build arg.
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
WORKDIR /app
COPY shared ./shared
COPY packages/ui ./packages/ui
COPY apps/customer-web ./apps/customer-web
WORKDIR /app/apps/customer-web
RUN npm run build

# Stage 4: Production
FROM node:20-alpine AS production
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json* ./
COPY shared/package.json ./shared/
COPY packages/ui/package.json ./packages/ui/
COPY apps/customer-web/package.json ./apps/customer-web/
RUN npm install --omit=dev --ignore-scripts --legacy-peer-deps \
    --workspace=apps/customer-web \
    --workspace=packages/ui \
    --workspace=shared \
    --include-workspace-root
COPY --from=builder /app/shared ./shared
COPY --from=builder /app/packages/ui ./packages/ui
COPY --from=builder /app/apps/customer-web/.next ./apps/customer-web/.next
COPY --from=builder /app/apps/customer-web/public ./apps/customer-web/public
COPY --from=builder /app/apps/customer-web/next.config.ts ./apps/customer-web/next.config.ts
WORKDIR /app/apps/customer-web
EXPOSE 3000
CMD ["npm", "run", "start"]
