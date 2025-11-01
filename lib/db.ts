import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// Configure connection pooling for Railway PostgreSQL
// Limit connections to prevent "too many clients" errors
// Railway PostgreSQL typically allows 100 connections, we use 10 per instance for safety
const getDatabaseUrl = () => {
  const url = process.env.DATABASE_URL || ''
  // Add connection_limit if not already present
  if (url && !url.includes('connection_limit=')) {
    const separator = url.includes('?') ? '&' : '?'
    return `${url}${separator}connection_limit=10&pool_timeout=20`
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
  })

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = db
}

export default db
