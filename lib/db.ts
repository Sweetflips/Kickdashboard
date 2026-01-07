import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { withAccelerate } from '@prisma/extension-accelerate'
import { logErrorRateLimited } from './rate-limited-logger'

// Check if we're using an Accelerate URL
const isAccelerateUrl = (url: string) => {
  return url.startsWith('prisma://') || url.startsWith('prisma+postgres://')
}

// Extended Prisma Client type - may or may not have Accelerate extension
type ExtendedPrismaClient = PrismaClient | ReturnType<typeof createPrismaClientWithAccelerate>

const globalForPrisma = globalThis as unknown as {
  prisma: ExtendedPrismaClient | undefined
}

// Prisma 7: Connection is configured via prisma.config.ts and DATABASE_URL env var
// Accelerate extension handles prisma+postgres:// URLs automatically
// For direct PostgreSQL connections, add connection pooling parameters
const getDatabaseUrl = () => {
  const url = process.env.DATABASE_URL || ''

  // If using Accelerate (prisma:// or prisma+postgres://), return as-is
  if (isAccelerateUrl(url)) {
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

// Create Prisma Client with Accelerate extension (for Accelerate URLs)
function createPrismaClientWithAccelerate() {
  const clientConfig: ConstructorParameters<typeof PrismaClient>[0] = {
    log: [],
    transactionOptions: {
      maxWait: 5000,
      timeout: 15000,
    },
  }
  return new PrismaClient(clientConfig).$extends(withAccelerate())
}

// Create standard Prisma Client (for direct PostgreSQL connections)
function createStandardPrismaClient() {
  const clientConfig: ConstructorParameters<typeof PrismaClient>[0] = {
    log: [],
    transactionOptions: {
      maxWait: 5000,
      timeout: 15000,
    },
  }
  return new PrismaClient(clientConfig)
}

// Create appropriate Prisma Client based on DATABASE_URL
function createPrismaClient(): ExtendedPrismaClient {
  const databaseUrl = getDatabaseUrl()
  
  // Only use Accelerate extension when we have an Accelerate URL
  // Direct PostgreSQL connections don't need/support it
  if (isAccelerateUrl(databaseUrl)) {
    return createPrismaClientWithAccelerate()
  }
  
  return createStandardPrismaClient()
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
