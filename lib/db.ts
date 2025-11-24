import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// Configure connection pooling for Railway PostgreSQL
// Railway PostgreSQL typically allows 100 connections total
// With multiple Next.js instances + worker, each needs a very small pool
// Use 5 per instance: allows up to 20 instances (20 × 5 = 100)
// This is conservative but prevents "too many clients" errors
// Worker processes should use even fewer connections (2-3)
const getDatabaseUrl = () => {
  const url = process.env.DATABASE_URL || ''
  // Add connection_limit if not already present
  if (url && !url.includes('connection_limit=')) {
    const separator = url.includes('?') ? '&' : '?'
    // Use smaller pool for worker processes (detected by POINT_WORKER env var)
    const isWorker = process.env.POINT_WORKER === 'true' || process.env.RAILWAY_SERVICE_NAME?.includes('worker')
    const connectionLimit = isWorker ? 3 : 5
    return `${url}${separator}connection_limit=${connectionLimit}&pool_timeout=10&connect_timeout=5`
  }
  return url
}

// CRITICAL: Always use singleton pattern in both dev and production
// This prevents multiple PrismaClient instances from creating separate connection pools
export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
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
  })

// Always store in global to ensure singleton pattern works in production
// Next.js in production can have multiple instances, but globalThis persists across them
globalForPrisma.prisma = db

export default db
