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
// Prisma 7: Must explicitly pass accelerateUrl when using Accelerate
function createPrismaClient() {
  const databaseUrl = process.env.DATABASE_URL || ''

  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable is not set')
  }

  // Prisma 7: Check if using Accelerate or direct connection
  const isAccelerate = databaseUrl.startsWith('prisma://') || databaseUrl.startsWith('prisma+postgres://')

  const clientConfig: any = {
    log: [], // Disable all Prisma logging - we handle errors with rate-limited logger
    transactionOptions: {
      maxWait: 5000, // Wait up to 5 seconds for transaction to start
      timeout: 15000, // Transaction timeout of 15 seconds
    },
  }

  // Prisma 7 with engine type "client" REQUIRES either accelerateUrl or adapter
  if (isAccelerate) {
    // For Accelerate: must pass accelerateUrl explicitly
    clientConfig.accelerateUrl = databaseUrl
  } else {
    // For direct PostgreSQL connections with Prisma 7 engine type "client",
    // you need to install @prisma/adapter-pg and pass an adapter instance
    // For now, throw a helpful error
    throw new Error(
      'Direct PostgreSQL connections require @prisma/adapter-pg. ' +
      'Install it with: npm install @prisma/adapter-pg pg\n' +
      'Or use Prisma Accelerate (prisma+postgres:// URL) instead.'
    )
  }

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
