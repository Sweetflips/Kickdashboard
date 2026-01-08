# Web (Next.js) Dockerfile
# Builds the Next app and runs `scripts/start.js` (which handles migrations + resilient start)
#
# IMPORTANT:
# - `Dockerfile.worker` is for the worker service and should remain separate.
# - The web runtime uses Prisma CLI for `migrate deploy`, so we keep devDependencies.

FROM node:22-bookworm-slim AS base

FROM base AS deps
WORKDIR /app

# Keep npm modern for lockfile compatibility
RUN npm install -g npm@latest

# Runtime/build deps needed by Prisma (and TLS)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    openssl \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
COPY prisma ./prisma
RUN npm ci

FROM base AS builder
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    openssl \
    && rm -rf /var/lib/apt/lists/*

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generates Prisma client + builds Next.js (.next)
RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    openssl \
    && rm -rf /var/lib/apt/lists/*

# node_modules must include prisma + tsx at runtime (migrations + workers)
COPY --from=deps /app/node_modules ./node_modules

# Next build output + public assets
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public

# Runtime files referenced by scripts / prisma migrate
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.js ./next.config.js
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.js ./prisma.config.js
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/lib ./lib

# Railway injects PORT at runtime; Next listens on it via scripts/start.js
EXPOSE 3000

CMD ["node", "scripts/start.js"]
