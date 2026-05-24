# Build context: monorepo root (for workspace dependencies)
# Build with: docker compose build admin

# Stage 1: Install dependencies
#
# Admin depends on @aks/ui (the shared shadcn library) for the
# CurrentLocationMarker on its map pickers, so packages/ui MUST be in the
# install graph — otherwise `next build` fails with "Can't resolve '@aks/ui'".
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
COPY shared/package.json ./shared/
COPY packages/ui/package.json ./packages/ui/
COPY apps/admin/package.json ./apps/admin/
RUN npm install --legacy-peer-deps

# Stage 2: Local development (hot reload via volume mount)
FROM deps AS dev
WORKDIR /app
COPY shared ./shared
COPY packages/ui ./packages/ui
COPY apps/admin ./apps/admin
WORKDIR /app/apps/admin
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
COPY apps/admin ./apps/admin
# Compile @aks/shared to dist/ — shared/package.json's "main" points to
# ./dist/index.js, and Next.js' SSR runtime resolves the workspace via
# require() (not the bundled output). Without this, server-render of admin
# pages 500s with 'Cannot find module @aks/shared/dist/index.js'.
RUN cd shared && npx tsc
WORKDIR /app/apps/admin
RUN npm run build

# Stage 4: Production
FROM node:20-alpine AS production
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json* ./
COPY shared/package.json ./shared/
COPY packages/ui/package.json ./packages/ui/
COPY apps/admin/package.json ./apps/admin/
RUN npm install --omit=dev --ignore-scripts --legacy-peer-deps
COPY --from=builder /app/shared ./shared
COPY --from=builder /app/packages/ui ./packages/ui
COPY --from=builder /app/apps/admin/.next ./apps/admin/.next
COPY --from=builder /app/apps/admin/public ./apps/admin/public
COPY --from=builder /app/apps/admin/next.config.ts ./apps/admin/next.config.ts
WORKDIR /app/apps/admin
EXPOSE 3000
CMD ["npm", "run", "start"]
