import { PrismaClient } from '@prisma/client'
import { withAccelerate } from '@prisma/extension-accelerate'
import { logErrorRateLimited } from './rate-limited-logger'

// Extended Prisma Client type with Accelerate
type PrismaClientWithAccelerate = ReturnType<typeof createPrismaClient>

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClientWithAccelerate | undefined
}

// Configure connection pooling for Railway PostgreSQL
// Railway PostgreSQL allows 100 connections total by default
// With high chat volume, we need larger pools and longer timeouts
// Main service gets 20 connections, workers get 10
const getDatabaseUrl = () => {
  const url = process.env.DATABASE_URL || ''
  // Add connection_limit if not already present
  if (url && !url.includes('connection_limit=')) {
    const separator = url.includes('?') ? '&' : '?'
    // Use smaller pool for worker processes (detected by POINT_WORKER env var)
    const isWorker = process.env.POINT_WORKER === 'true' || process.env.RAILWAY_SERVICE_NAME?.includes('worker')
    // Increase pool size: 20 for main service, 10 for workers
    // Increase timeouts: 30s pool timeout, 10s connect timeout
    const connectionLimit = isWorker ? 10 : 20
    return `${url}${separator}connection_limit=${connectionLimit}&pool_timeout=30&connect_timeout=10`
  }
  return url
}

// Create Prisma Client with Accelerate extension
function createPrismaClient() {
  return new PrismaClient({
    log: [], // Disable all Prisma logging - we handle errors with rate-limited logger
    datasources: {
      db: {
        url: getDatabaseUrl(),
      },
    },
    // Configure transaction timeout - shorter to release connections faster
    transactionOptions: {
      maxWait: 5000, // Wait up to 5 seconds for transaction to start
      timeout: 15000, // Transaction timeout of 15 seconds
    },
  }).$extends(withAccelerate())
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
