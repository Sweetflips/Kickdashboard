import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// Configure connection pooling for Railway PostgreSQL
// Railway PostgreSQL typically allows 100 connections total
// With multiple Next.js instances + worker, each needs a very small pool
// Use 10 per instance: allows up to 10 instances (10 × 10 = 100)
// This is conservative but prevents "too many clients" errors
const getDatabaseUrl = () => {
  const url = process.env.DATABASE_URL || ''
  // Add connection_limit if not already present
  if (url && !url.includes('connection_limit=')) {
    const separator = url.includes('?') ? '&' : '?'
    return `${url}${separator}connection_limit=10&pool_timeout=15&connect_timeout=10`
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
      maxWait: 10000, // Wait up to 10 seconds for transaction to start
      timeout: 20000, // Transaction timeout of 20 seconds
    },
  })

// Always store in global to ensure singleton pattern works in production
// Next.js in production can have multiple instances, but globalThis persists across them
globalForPrisma.prisma = db

export default db
