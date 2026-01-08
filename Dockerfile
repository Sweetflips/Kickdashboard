# Use Node.js 22 LTS (required for Prisma Accelerate extension)
FROM node:22-bookworm-slim AS base

# Install dependencies only when needed
FROM base AS deps
WORKDIR /app

# Update npm to latest version
RUN npm install -g npm@latest

# Install OpenSSL for Prisma (needed during postinstall)
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl \
    && rm -rf /var/lib/apt/lists/*

# Copy package files and prisma schema/config (needed for postinstall)
COPY package.json package-lock.json* ./
COPY prisma ./prisma
COPY prisma.config.js ./

# Install dependencies (this runs postinstall which generates Prisma client)
RUN npm ci

# Build the application
FROM deps AS builder
WORKDIR /app

# Copy source code
COPY . .

# Allow DATABASE_URL to be passed as build arg (optional, use provided URL if not set)
# Note: Prisma generate doesn't actually connect during build, just needs valid URL format
ARG DATABASE_URL
ENV DATABASE_URL=${DATABASE_URL:-postgresql://postgres:TGlahexkFWDUIbBOxJKxmTyPPvnSdrIj@shuttle.proxy.rlwy.net:41247/railway}

# Build Next.js app
RUN npm run build

# Production image
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Install runtime dependencies (ca-certificates for TLS, openssl for Prisma)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    openssl \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN groupadd --system --gid 1001 nodejs && \
    useradd --system --uid 1001 --gid nodejs nextjs

# Copy full node_modules (needed for tsx, prisma CLI, etc.)
COPY --from=builder /app/node_modules ./node_modules

# Copy application files
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/lib ./lib
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.js ./
COPY --from=builder /app/package.json ./
COPY --from=builder /app/tsconfig.json ./

# Set correct permissions
RUN chown -R nextjs:nodejs /app

USER nextjs

EXPOSE 3000

# PORT and HOSTNAME are injected by Railway at runtime.
# Fallback values are handled in scripts/start.js.
ENV HOSTNAME="0.0.0.0"

# Start the application
CMD ["node", "scripts/start.js"]
