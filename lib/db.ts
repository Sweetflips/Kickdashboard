import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { withAccelerate } from '@prisma/extension-accelerate'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'

// Check if URL is a Prisma Accelerate URL
const isAccelerateUrl = (url: string) => {
  if (!url) return false
  // Accelerate URLs start with prisma:// or prisma+postgres://
  // They also contain 'accelerate' in the hostname typically
  return url.startsWith('prisma://') ||
         url.startsWith('prisma+postgres://') ||
         url.includes('accelerate.prisma-data.net')
}

// Check if URL is a direct PostgreSQL URL
const isDirectPostgresUrl = (url: string) => {
  if (!url) return false
  return url.startsWith('postgres://') || url.startsWith('postgresql://')
}

const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof createClient> | undefined
}

// Create Prisma Client with Accelerate extension (for Accelerate URLs)
function createAccelerateClient() {
  console.log('[Prisma] Initializing Accelerate client')
  return new PrismaClient({
    accelerateUrl: process.env.DATABASE_URL,
  }).$extends(withAccelerate())
}

// Create standard Prisma Client with pg adapter (for direct PostgreSQL URLs)
function createStandardClient() {
  // For direct connections, prefer DIRECT_URL, then fall back to DATABASE_URL
  const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL

  if (!connectionString) {
    throw new Error('DIRECT_URL or DATABASE_URL must be set for direct PostgreSQL connection')
  }

  if (!isDirectPostgresUrl(connectionString)) {
    console.error('[Prisma] Warning: Connection string does not appear to be a direct PostgreSQL URL:', connectionString.substring(0, 30) + '...')
  }

  console.log('[Prisma] Initializing pg adapter with direct connection')

  // Create a pg Pool for the adapter
  const pool = new pg.Pool({ connectionString })
  const adapter = new PrismaPg(pool)

  return new PrismaClient({
    adapter,
  })
}

function createClient() {
  const databaseUrl = process.env.DATABASE_URL || ''
  const directUrl = process.env.DIRECT_URL || ''

  // Log environment for debugging
  console.log('[Prisma] Environment check:')
  console.log('[Prisma]   DATABASE_URL set:', !!databaseUrl)
  console.log('[Prisma]   DATABASE_URL is Accelerate:', isAccelerateUrl(databaseUrl))
  console.log('[Prisma]   DIRECT_URL set:', !!directUrl)

  // If DATABASE_URL is an Accelerate URL, use Accelerate client
  if (isAccelerateUrl(databaseUrl)) {
    return createAccelerateClient()
  }

  // Otherwise, use direct PostgreSQL connection with pg adapter
  return createStandardClient()
}

export const db = globalForPrisma.prisma ?? (globalForPrisma.prisma = createClient())
export default db
