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
WORKDIR /app/backend
RUN npx prisma generate
RUN npm run build

# Stage 4: Production runtime image
FROM node:20-slim AS production
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json* ./
COPY shared/package.json ./shared/
COPY backend/package.json ./backend/
RUN npm install --omit=dev --ignore-scripts --legacy-peer-deps
COPY --from=builder /app/shared ./shared
COPY --from=builder /app/backend/dist ./backend/dist
COPY --from=builder /app/backend/node_modules/.prisma ./backend/node_modules/.prisma
COPY backend/prisma/schema.prisma ./backend/prisma/schema.prisma
WORKDIR /app/backend
EXPOSE 3000
CMD ["node", "dist/index.js"]
