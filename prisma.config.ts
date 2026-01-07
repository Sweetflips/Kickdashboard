import 'dotenv/config'
import { defineConfig } from 'prisma/config'

// For migrations, use DIRECT_URL (actual PostgreSQL connection)
// Prisma Accelerate URLs (prisma+postgres://) cannot be used for migrations
// Fallback chain: DIRECT_URL -> DATABASE_URL (if not Accelerate) -> hardcoded fallback
const getDirectUrl = () => {
  if (process.env.DIRECT_URL) {
    return process.env.DIRECT_URL
  }
  
  const dbUrl = process.env.DATABASE_URL || ''
  // If DATABASE_URL is an Accelerate URL, we can't use it for migrations
  if (dbUrl.startsWith('prisma://') || dbUrl.startsWith('prisma+postgres://')) {
    // Return fallback direct connection
    return 'postgresql://postgres:TGlahexkFWDUIbBOxJKxmTyPPvnSdrIj@shuttle.proxy.rlwy.net:41247/railway'
  }
  
  return dbUrl || 'postgresql://postgres:TGlahexkFWDUIbBOxJKxmTyPPvnSdrIj@shuttle.proxy.rlwy.net:41247/railway'
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: getDirectUrl(),
  },
})
