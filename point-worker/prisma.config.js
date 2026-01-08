// @ts-check
// dotenv not needed - Railway injects env vars at runtime

// Get the direct URL for migrations (can't use Accelerate URLs for migrations)
const directUrl = process.env.DIRECT_URL || ''
const databaseUrl = process.env.DATABASE_URL || ''

// Migrations require a direct PostgreSQL URL, not an Accelerate URL
function getMigrationUrl() {
  // First priority: DIRECT_URL (should always be the direct PostgreSQL connection)
  if (directUrl && (directUrl.startsWith('postgres://') || directUrl.startsWith('postgresql://'))) {
    console.log('[prisma.config.js] Using DIRECT_URL for migrations')
    return directUrl
  }

  // Fallback: DATABASE_URL if it's a direct PostgreSQL URL (not Accelerate)
  if (databaseUrl && (databaseUrl.startsWith('postgres://') || databaseUrl.startsWith('postgresql://'))) {
    console.log('[prisma.config.js] Using DATABASE_URL for migrations (direct PostgreSQL)')
    return databaseUrl
  }

  // If we get here, we have an Accelerate URL but no DIRECT_URL
  console.error('[prisma.config.js] ERROR: No direct PostgreSQL URL available for migrations!')
  console.error('[prisma.config.js] DIRECT_URL:', directUrl ? 'set (but not postgres://)' : 'NOT SET')
  console.error('[prisma.config.js] DATABASE_URL:', databaseUrl ? 'set (Accelerate URL)' : 'NOT SET')

  // Return the hardcoded Railway PostgreSQL URL as absolute fallback
  return 'postgresql://postgres:TGlahexkFWDUIbBOxJKxmTyPPvnSdrIj@shuttle.proxy.rlwy.net:41247/railway'
}

const migrationUrl = getMigrationUrl()
console.log('[prisma.config.js] Migration URL configured:', migrationUrl ? 'YES' : 'NO')

/** @type {import('prisma/config').PrismaConfig} */
module.exports = {
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: migrationUrl,
  },
}
