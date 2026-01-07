import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { withAccelerate } from '@prisma/extension-accelerate'

// Check if URL is a Prisma Accelerate URL
const isAccelerateUrl = (url: string) => {
  return url.startsWith('prisma://') || url.startsWith('prisma+postgres://')
}

// Create Prisma Client with Accelerate extension (only for Accelerate URLs)
function createAccelerateClient() {
  return new PrismaClient({
    log: [],
    transactionOptions: {
      maxWait: 5000,
      timeout: 15000,
    },
  }).$extends(withAccelerate())
}

// Create standard Prisma Client (for regular PostgreSQL URLs)
function createStandardClient() {
  return new PrismaClient({
    log: [],
    transactionOptions: {
      maxWait: 5000,
      timeout: 15000,
    },
  })
}

// Use Accelerate client type for consistent API - PrismaClient is compatible
type DbClient = ReturnType<typeof createAccelerateClient>

const globalForPrisma = globalThis as unknown as {
  prisma: DbClient | undefined
}

// Create appropriate client based on DATABASE_URL
function createClient(): DbClient {
  const url = process.env.DATABASE_URL || ''

  if (isAccelerateUrl(url)) {
    return createAccelerateClient()
  }

  // Standard PrismaClient is compatible with the Accelerate type
  // (Accelerate extension only adds cacheStrategy option which is optional)
  return createStandardClient() as unknown as DbClient
}

// Lazy initialization - client is only created when first accessed
// This prevents build-time instantiation errors
function getClient(): DbClient {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createClient()
  }
  return globalForPrisma.prisma
}

// Export a proxy that lazily initializes the client on first access
export const db = new Proxy({} as DbClient, {
  get(_target, prop) {
    const client = getClient()
    const value = client[prop as keyof DbClient]
    // Bind methods to preserve 'this' context
    if (typeof value === 'function') {
      return value.bind(client)
    }
    return value
  },
})

export default db
