import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// Configure connection pooling for Railway PostgreSQL
// Limit connections to prevent "too many clients" errors
// Railway PostgreSQL typically allows 100 connections, we use 20 per instance for better concurrency
const getDatabaseUrl = () => {
  const url = process.env.DATABASE_URL || ''
  // Add connection_limit if not already present
  if (url && !url.includes('connection_limit=')) {
    const separator = url.includes('?') ? '&' : '?'
    return `${url}${separator}connection_limit=20&pool_timeout=30&connect_timeout=10`
  }
  return url
}

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
      maxWait: 10000, // Wait up to 10 seconds for transaction to start
      timeout: 20000, // Transaction timeout of 20 seconds
    },
  })

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = db
}

export default db
