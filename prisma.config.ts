import 'dotenv/config'
import { defineConfig } from 'prisma/config'

// Get the direct URL for migrations (can't use Accelerate URLs for migrations)
const directUrl = process.env.DIRECT_URL || ''
const databaseUrl = process.env.DATABASE_URL || ''

// Migrations require a direct PostgreSQL URL, not an Accelerate URL
const getMigrationUrl = () => {
  // First priority: DIRECT_URL (should always be the direct PostgreSQL connection)
  if (directUrl && (directUrl.startsWith('postgres://') || directUrl.startsWith('postgresql://'))) {
    console.log('[prisma.config.ts] Using DIRECT_URL for migrations')
    return directUrl
  }
  
  // Fallback: DATABASE_URL if it's a direct PostgreSQL URL (not Accelerate)
  if (databaseUrl && (databaseUrl.startsWith('postgres://') || databaseUrl.startsWith('postgresql://'))) {
    console.log('[prisma.config.ts] Using DATABASE_URL for migrations (direct PostgreSQL)')
    return databaseUrl
  }
  
  // If we get here, we have an Accelerate URL but no DIRECT_URL
  console.error('[prisma.config.ts] ERROR: No direct PostgreSQL URL available for migrations!')
  console.error('[prisma.config.ts] DIRECT_URL:', directUrl ? 'set (but not postgres://)' : 'NOT SET')
  console.error('[prisma.config.ts] DATABASE_URL:', databaseUrl ? 'set (Accelerate URL)' : 'NOT SET')
  
  // Return the hardcoded Railway PostgreSQL URL as absolute fallback
  return 'postgresql://postgres:TGlahexkFWDUIbBOxJKxmTyPPvnSdrIj@shuttle.proxy.rlwy.net:41247/railway'
}

const migrationUrl = getMigrationUrl()
console.log('[prisma.config.ts] Migration URL configured:', migrationUrl ? 'YES' : 'NO')

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: migrationUrl,
  },
})
