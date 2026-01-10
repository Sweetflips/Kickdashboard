import { config } from 'dotenv'
// Load .env.local first, then fall back to .env
config({ path: '.env.local' })
config({ path: '.env' })

import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import { logErrorRateLimited } from './rate-limited-logger'

// Check if we're using an Accelerate URL
const isAccelerateUrl = (url: string) => {
  return url.startsWith('prisma://') || url.startsWith('prisma+postgres://')
}

// Singleton storage - use any to avoid Prisma 7 type union issues
const globalForPrisma = globalThis as unknown as {
  prisma: any
  pgPool: Pool | undefined
}

// Get raw DATABASE_URL
const getRawDatabaseUrl = () => {
  return process.env.DATABASE_URL || ''
}

// Create Prisma Client with Accelerate extension
// ONLY used when DATABASE_URL starts with prisma:// or prisma+postgres://
function createPrismaClientWithAccelerate(accelerateUrl: string) {
  const { withAccelerate } = require('@prisma/extension-accelerate')

  const clientConfig: ConstructorParameters<typeof PrismaClient>[0] = {
    // Prisma 7+ validation: Accelerate engine requires accelerateUrl in constructor options
    // when using the "client" engine type (no local query engine).
    // The extension enables Accelerate features; the constructor option satisfies validation.
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore - accelerateUrl is supported at runtime but may not be in older Prisma TS types
    accelerateUrl,
    log: [],
    transactionOptions: {
      maxWait: 5000,
      timeout: 15000,
    },
  }
  // withAccelerate() should be applied without needing to re-pass the URL here;
  // accelerateUrl is already supplied to the PrismaClient constructor.
  return new PrismaClient(clientConfig).$extends(withAccelerate())
}

// Create standard Prisma Client using pg adapter (for direct PostgreSQL connections)
// Used when DATABASE_URL is a standard postgresql:// URL
// The pg adapter is required because Prisma 7 client was generated with --no-engine
function createStandardPrismaClient() {
  const databaseUrl = getRawDatabaseUrl()

  // Create connection pool with appropriate settings
  const isWorker = process.env.POINT_WORKER === 'true' || process.env.RAILWAY_SERVICE_NAME?.includes('worker')
  const connectionLimit = isWorker ? 10 : 20

  // Create pg Pool
  const pool = new Pool({
    connectionString: databaseUrl,
    max: connectionLimit,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  })

  // Store pool in global for cleanup
  globalForPrisma.pgPool = pool

  // Create Prisma adapter
  const adapter = new PrismaPg(pool)

  // Create Prisma Client with pg adapter
  return new PrismaClient({
    adapter,
    log: [],
    transactionOptions: {
      maxWait: 5000,
      timeout: 15000,
    },
  })
}

// Create appropriate Prisma Client based on DATABASE_URL
// IMPORTANT: All client types connect to the SAME database
// - Standard Client with pg adapter: Direct PostgreSQL connection (your current setup)
// - Accelerate Client: Connection through Prisma Accelerate proxy (caching, pooling)
// - Both read/write the same data - switching between them won't cause data issues
function createPrismaClient(): any {
  const databaseUrl = getRawDatabaseUrl()

  // Conditional: Use Accelerate client ONLY if URL starts with prisma://
  if (isAccelerateUrl(databaseUrl)) {
    console.log('[db.ts] Using Prisma Accelerate client (prisma:// URL detected)')
    return createPrismaClientWithAccelerate(databaseUrl)
  }

  // Otherwise, use standard PostgreSQL client with pg adapter
  console.log('[db.ts] Using standard Prisma client with pg adapter (direct PostgreSQL connection)')
  return createStandardPrismaClient()
}

// Export the singleton instance as any to ensure $transaction and model calls
// work correctly across the entire project regardless of the underlying client type
export const db: any = globalForPrisma.prisma ?? createPrismaClient()

// Store in global
globalForPrisma.prisma = db

export default db
