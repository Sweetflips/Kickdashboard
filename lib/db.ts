import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { withAccelerate } from '@prisma/extension-accelerate'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'

// Check if URL is a Prisma Accelerate URL
const isAccelerateUrl = (url: string) => {
  return url.startsWith('prisma://') || url.startsWith('prisma+postgres://')
}

const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof createClient> | undefined
}

// Create Prisma Client with Accelerate extension (for Accelerate URLs)
function createAccelerateClient() {
  return new PrismaClient({
    accelerateUrl: process.env.DATABASE_URL,
  }).$extends(withAccelerate())
}

// Create standard Prisma Client with pg adapter (for direct PostgreSQL URLs)
function createStandardClient() {
  const connectionString = process.env.DATABASE_URL || process.env.DIRECT_URL

  if (!connectionString) {
    throw new Error('DATABASE_URL or DIRECT_URL must be set')
  }

  // Create a pg Pool for the adapter
  const pool = new pg.Pool({ connectionString })
  const adapter = new PrismaPg(pool)

  return new PrismaClient({
    adapter,
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
