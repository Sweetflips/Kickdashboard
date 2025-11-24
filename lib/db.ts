import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// Configure connection pooling for Railway PostgreSQL
// Railway PostgreSQL typically allows 100 connections
// Use 60 per instance to handle high concurrency during live streams
const getDatabaseUrl = () => {
  const url = process.env.DATABASE_URL || ''
  // Add connection_limit if not already present
  if (url && !url.includes('connection_limit=')) {
    const separator = url.includes('?') ? '&' : '?'
    return `${url}${separator}connection_limit=60&pool_timeout=30&connect_timeout=10`
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
    // Configure transaction timeout (default is 5 seconds, increase for high concurrency)
    transactionOptions: {
      maxWait: 15000, // Wait up to 15 seconds for transaction to start
      timeout: 30000, // Transaction timeout of 30 seconds
    },
  })

// Always store in global to ensure singleton pattern works in production
// Next.js in production can have multiple instances, but globalThis persists across them
globalForPrisma.prisma = db

export default db
