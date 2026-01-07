import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { withAccelerate } from '@prisma/extension-accelerate'

// Check if URL is a Prisma Accelerate URL
const isAccelerateUrl = (url: string) => {
  return url.startsWith('prisma://') || url.startsWith('prisma+postgres://')
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | ReturnType<typeof createAccelerateClient> | undefined
}

// Create Prisma Client with Accelerate extension (for Accelerate URLs)
function createAccelerateClient() {
  return new PrismaClient({
    accelerateUrl: process.env.DATABASE_URL,
  }).$extends(withAccelerate())
}

// Create standard Prisma Client (for direct PostgreSQL URLs)
function createStandardClient() {
  return new PrismaClient({
    log: [],
    transactionOptions: {
      maxWait: 5000,
      timeout: 15000,
    },
  })
}

function createClient() {
  const databaseUrl = process.env.DATABASE_URL || ''
  if (isAccelerateUrl(databaseUrl)) {
    return createAccelerateClient()
  }
  return createStandardClient()
}

export const db = globalForPrisma.prisma ?? (globalForPrisma.prisma = createClient())
export default db
