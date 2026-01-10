# Worker Dockerfile - uses Node 22.12+ for Prisma 7.2.0 compatibility
FROM node:22.13-alpine3.21 AS base

WORKDIR /app

# Install OpenSSL for Prisma and wget for healthcheck
RUN apk add --no-cache openssl wget && echo "cache-bust-$(date +%s)"

# Copy package files from parent directory (build context is point-worker/)
# We need to copy the actual files that were placed here
COPY package.json package-lock.json ./
COPY prisma ./prisma/

# Install dependencies
RUN npm ci --omit=dev

# Generate Prisma client
RUN npx prisma generate

# Copy tsconfig for path aliases
COPY tsconfig.json ./

# Copy scripts and lib
COPY scripts ./scripts/
COPY lib ./lib/

# Start worker
CMD ["node", "scripts/start-worker.js"]
