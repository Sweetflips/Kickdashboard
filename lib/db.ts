import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function createClient() {
  // Use DIRECT_URL for direct PostgreSQL connection (preferred)
  // Fall back to DATABASE_URL if it's a direct postgres:// URL
  const databaseUrl = process.env.DIRECT_URL || process.env.DATABASE_URL || ''
  
  // Skip Accelerate URLs - use direct connection only
  const isAccelerateUrl = databaseUrl.startsWith('prisma://') || databaseUrl.startsWith('prisma+postgres://')
  
  if (isAccelerateUrl) {
    console.error('[Prisma] ERROR: Accelerate URL detected but we need a direct PostgreSQL URL')
    console.error('[Prisma] Set DIRECT_URL to your PostgreSQL connection string')
    throw new Error('DIRECT_URL must be set to a direct PostgreSQL connection string')
  }

  if (!databaseUrl) {
    throw new Error('DATABASE_URL or DIRECT_URL must be set')
  }

  console.log('[Prisma] Using direct PostgreSQL connection')
  
  // Create pg Pool for the adapter
  const pool = new pg.Pool({ connectionString: databaseUrl })
  const adapter = new PrismaPg(pool)
  
  return new PrismaClient({ adapter })
}

export const db = globalForPrisma.prisma ?? (globalForPrisma.prisma = createClient())
export default db
