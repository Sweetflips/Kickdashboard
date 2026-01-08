# Worker Dockerfile (for point-worker branch)
# Uses full node_modules (not standalone) because workers need tsx and prisma CLI
# NO Next.js build - this is a background worker service

FROM node:22-bookworm-slim AS base

# Install dependencies
FROM base AS deps
WORKDIR /app

# Update npm to latest version
RUN npm install -g npm@latest

# Install OpenSSL for Prisma (needed during postinstall)
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl \
    && rm -rf /var/lib/apt/lists/*

# Copy package files and prisma schema
COPY package.json package-lock.json* ./
COPY prisma ./prisma

# Install ALL dependencies (including devDependencies for tsx)
RUN npm ci

# Production image for worker
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

# Install runtime dependencies (ca-certificates for TLS, openssl for Prisma)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    openssl \
    && rm -rf /var/lib/apt/lists/*

# Copy node_modules (includes tsx, prisma CLI, etc.)
COPY --from=deps /app/node_modules ./node_modules

# Copy application files
COPY package.json ./
COPY prisma ./prisma
COPY scripts ./scripts
COPY lib ./lib

# Expose port for healthcheck (Railway injects PORT at runtime)
EXPOSE 8080

# Start the worker directly
CMD ["node", "scripts/start-worker.js"]
