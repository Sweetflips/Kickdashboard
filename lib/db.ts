import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { withAccelerate } from '@prisma/extension-accelerate'
import { logErrorRateLimited } from './rate-limited-logger'

// Extended Prisma Client type with Accelerate
type PrismaClientWithAccelerate = ReturnType<typeof createPrismaClient>

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClientWithAccelerate | undefined
}

// Prisma 7: Connection is configured via prisma.config.ts and DATABASE_URL env var
// Accelerate extension handles prisma+postgres:// URLs automatically
// For direct PostgreSQL connections, add connection pooling parameters
const getDatabaseUrl = () => {
  const url = process.env.DATABASE_URL || ''

  // If using Accelerate (prisma:// or prisma+postgres://), return as-is
  if (url.startsWith('prisma://') || url.startsWith('prisma+postgres://')) {
    return url
  }

  // For direct PostgreSQL connections, add connection pooling parameters
  if (url && !url.includes('connection_limit=')) {
    const separator = url.includes('?') ? '&' : '?'
    const isWorker = process.env.POINT_WORKER === 'true' || process.env.RAILWAY_SERVICE_NAME?.includes('worker')
    const connectionLimit = isWorker ? 10 : 20
    return `${url}${separator}connection_limit=${connectionLimit}&pool_timeout=30&connect_timeout=10`
  }

  return url
}

// Create Prisma Client with Accelerate extension
// The extension works as a no-op for direct PostgreSQL connections
function createPrismaClient() {
  // Defer DATABASE_URL check to runtime - during build, module evaluation
  // happens without env vars and we must not throw
  const databaseUrl = getDatabaseUrl()

  const clientConfig: ConstructorParameters<typeof PrismaClient>[0] = {
    log: [], // Disable all Prisma logging - we handle errors with rate-limited logger
    transactionOptions: {
      maxWait: 5000, // Wait up to 5 seconds for transaction to start
      timeout: 15000, // Transaction timeout of 15 seconds
    },
  }

  // Always apply Accelerate extension for consistent typing
  // Extension is no-op for standard postgresql:// URLs
  return new PrismaClient(clientConfig).$extends(withAccelerate())
}

// CRITICAL: Always use singleton pattern in both dev and production
// This prevents multiple PrismaClient instances from creating separate connection pools
// Disable Prisma's built-in logging to prevent connection error spam
// We handle errors with rate-limited logging in our code instead
export const db = globalForPrisma.prisma ?? createPrismaClient()

// Always store in global to ensure singleton pattern works in production
// Next.js in production can have multiple instances, but globalThis persists across them
globalForPrisma.prisma = db

export default db
