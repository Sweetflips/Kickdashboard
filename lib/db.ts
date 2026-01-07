import 'dotenv/config'
import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// Create standard Prisma Client
function createClient(): PrismaClient {
  return new PrismaClient({
    log: [],
    transactionOptions: {
      maxWait: 5000,
      timeout: 15000,
    },
  })
}

// Lazy initialization - client is only created when first accessed
// This prevents build-time instantiation errors
function getClient(): PrismaClient {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createClient()
  }
  return globalForPrisma.prisma
}

// Export a proxy that lazily initializes the client on first access
export const db = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getClient()
    const value = client[prop as keyof PrismaClient]
    // Bind methods to preserve 'this' context
    if (typeof value === 'function') {
      return value.bind(client)
    }
    return value
  },
})

export default db
