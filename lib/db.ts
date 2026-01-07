import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { withAccelerate } from '@prisma/extension-accelerate'

// Create Prisma Client with Accelerate extension
// Extension works as pass-through for standard postgresql:// URLs
function createPrismaClient() {
  return new PrismaClient({
    log: [],
    transactionOptions: {
      maxWait: 5000,
      timeout: 15000,
    },
  }).$extends(withAccelerate())
}

type PrismaClientWithAccelerate = ReturnType<typeof createPrismaClient>

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClientWithAccelerate | undefined
}

// Lazy initialization - client is only created when first accessed
// This prevents build-time instantiation errors
function getClient(): PrismaClientWithAccelerate {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createPrismaClient()
  }
  return globalForPrisma.prisma
}

// Export a proxy that lazily initializes the client on first access
export const db = new Proxy({} as PrismaClientWithAccelerate, {
  get(_target, prop) {
    const client = getClient()
    const value = client[prop as keyof PrismaClientWithAccelerate]
    // Bind methods to preserve 'this' context
    if (typeof value === 'function') {
      return value.bind(client)
    }
    return value
  },
})

export default db
