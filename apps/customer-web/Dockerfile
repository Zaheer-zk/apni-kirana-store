# Build context: monorepo root (for workspace dependencies)
# Build with: docker compose -f docker-compose.prod.yml build customer-web

# Stage 1: Install dependencies
#
# We deliberately copy ONLY the workspace package.json files customer-web
# actually consumes (root, shared, packages/ui, apps/customer-web). The
# root package.json declares 7 workspaces; npm silently skips the ones
# whose directories aren't present.
#
# Plain `npm install --legacy-peer-deps` was used here for a while, then
# briefly switched to `--workspace=...` flags to try to fix a build issue.
# It turned out the workspace flags interacted badly with @aks/ui's
# `react` peer dep — react/react-dom wouldn't hoist into /app/node_modules.
# Verified locally: this plain-install form hoists react reliably and
# matches what apps/admin/Dockerfile does (which has always worked).
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
COPY shared/package.json ./shared/
COPY packages/ui/package.json ./packages/ui/
COPY apps/customer-web/package.json ./apps/customer-web/
# --no-audit / --no-fund: also serves to bust BuildKit's stale layer cache
# from earlier failed attempts that produced an incomplete node_modules.
# The sanity check fails loud if react ever doesn't get hoisted — we hit
# that twice on the server and want a clear error, not a downstream
# "Cannot find module 'react'" from next build.
RUN npm install --legacy-peer-deps --no-audit --no-fund && \
    test -f /app/node_modules/react/package.json && \
    test -f /app/node_modules/react-dom/package.json

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
# Compile @aks/shared to dist/ — see admin's Dockerfile for the rationale.
# Defensive: today this app's imports happen to all get inlined, but if any
# future SSR boundary touches @aks/shared it'd 500 without this.
RUN cd shared && npx tsc
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
RUN npm install --omit=dev --ignore-scripts --legacy-peer-deps
COPY --from=builder /app/shared ./shared
COPY --from=builder /app/packages/ui ./packages/ui
COPY --from=builder /app/apps/customer-web/.next ./apps/customer-web/.next
COPY --from=builder /app/apps/customer-web/public ./apps/customer-web/public
COPY --from=builder /app/apps/customer-web/next.config.ts ./apps/customer-web/next.config.ts
WORKDIR /app/apps/customer-web
EXPOSE 3000
CMD ["npm", "run", "start"]
