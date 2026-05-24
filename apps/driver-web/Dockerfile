# Build context: monorepo root (for workspace dependencies)
# Build with: docker compose -f docker-compose.prod.yml build driver-web

# Stage 1: Install dependencies
#
# See apps/customer-web/Dockerfile for the rationale — only copy the
# workspace package.json files this app actually consumes (root, shared,
# packages/ui, apps/driver-web). The other workspaces (backend, admin,
# customer-web, store-web) are silently skipped by npm.
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
COPY shared/package.json ./shared/
COPY packages/ui/package.json ./packages/ui/
COPY apps/driver-web/package.json ./apps/driver-web/
# --no-audit / --no-fund: also serves to bust BuildKit's stale layer cache
# from earlier failed attempts that produced an incomplete node_modules.
# See apps/customer-web/Dockerfile for context.
RUN npm install --legacy-peer-deps --no-audit --no-fund && \
    test -f /app/node_modules/react/package.json && \
    test -f /app/node_modules/react-dom/package.json

# Stage 2: Local development (hot reload via volume mount)
FROM deps AS dev
WORKDIR /app
COPY shared ./shared
COPY packages/ui ./packages/ui
COPY apps/driver-web ./apps/driver-web
WORKDIR /app/apps/driver-web
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
COPY apps/driver-web ./apps/driver-web
WORKDIR /app/apps/driver-web
RUN npm run build

# Stage 4: Production
FROM node:20-alpine AS production
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json* ./
COPY shared/package.json ./shared/
COPY packages/ui/package.json ./packages/ui/
COPY apps/driver-web/package.json ./apps/driver-web/
RUN npm install --omit=dev --ignore-scripts --legacy-peer-deps
COPY --from=builder /app/shared ./shared
COPY --from=builder /app/packages/ui ./packages/ui
COPY --from=builder /app/apps/driver-web/.next ./apps/driver-web/.next
COPY --from=builder /app/apps/driver-web/public ./apps/driver-web/public
COPY --from=builder /app/apps/driver-web/next.config.ts ./apps/driver-web/next.config.ts
WORKDIR /app/apps/driver-web
EXPOSE 3000
CMD ["npm", "run", "start"]
