# Build context: monorepo root (so we can access shared/ package)
# Build with: docker compose build backend

# Stage 1: Install dependencies
FROM node:20-slim AS deps
WORKDIR /app

# Install OpenSSL for Prisma
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# Copy workspace manifests for dependency resolution
COPY package.json package-lock.json* ./
COPY shared/package.json ./shared/
COPY backend/package.json ./backend/
COPY backend/prisma/schema.prisma ./backend/prisma/schema.prisma

# Install all workspace dependencies
RUN npm install --legacy-peer-deps

# Stage 2: Local development (hot reload via volume mount)
FROM deps AS dev
WORKDIR /app
COPY shared ./shared
COPY backend ./backend
WORKDIR /app/backend
RUN npx prisma generate
EXPOSE 3000
CMD ["npm", "run", "dev"]

# Stage 3: Build for production
FROM deps AS builder
WORKDIR /app
COPY shared ./shared
COPY backend ./backend
# Build the @aks/shared workspace — production runs compiled JS (shared/dist),
# whereas dev resolves @aks/shared from source via tsconfig paths.
RUN cd shared && npx tsc
WORKDIR /app/backend
RUN npx prisma generate
RUN npm run build

# Stage 4: Production runtime image
FROM node:20-slim AS production
WORKDIR /app
ENV NODE_ENV=production
# Prisma's query/schema engines need OpenSSL at runtime
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json* ./
COPY shared/package.json ./shared/
COPY backend/package.json ./backend/
RUN npm install --omit=dev --ignore-scripts --legacy-peer-deps
COPY --from=builder /app/shared ./shared
COPY --from=builder /app/backend/dist ./backend/dist
# node_modules is hoisted to the repo root by npm workspaces — the generated
# Prisma client lives at /app/node_modules/.prisma, not under backend/.
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
# Whole prisma dir (schema + migrations) so `prisma migrate deploy` works in prod
COPY backend/prisma ./backend/prisma
WORKDIR /app/backend
EXPOSE 3000
CMD ["node", "dist/index.js"]
