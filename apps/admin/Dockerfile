# Build context: monorepo root (for workspace dependencies)
# Build with: docker compose build admin

# Stage 1: Install dependencies
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
COPY shared/package.json ./shared/
COPY apps/admin/package.json ./apps/admin/
RUN npm install --legacy-peer-deps

# Stage 2: Local development (hot reload via volume mount)
FROM deps AS dev
WORKDIR /app
COPY shared ./shared
COPY apps/admin ./apps/admin
WORKDIR /app/apps/admin
EXPOSE 3000
CMD ["npm", "run", "dev"]

# Stage 3: Build
FROM deps AS builder
WORKDIR /app
COPY shared ./shared
COPY apps/admin ./apps/admin
WORKDIR /app/apps/admin
RUN npm run build

# Stage 4: Production
FROM node:20-alpine AS production
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json* ./
COPY shared/package.json ./shared/
COPY apps/admin/package.json ./apps/admin/
RUN npm install --omit=dev --ignore-scripts --legacy-peer-deps
COPY --from=builder /app/shared ./shared
COPY --from=builder /app/apps/admin/.next ./apps/admin/.next
COPY --from=builder /app/apps/admin/public ./apps/admin/public
COPY --from=builder /app/apps/admin/next.config.ts ./apps/admin/next.config.ts
WORKDIR /app/apps/admin
EXPOSE 3000
CMD ["npm", "run", "start"]
