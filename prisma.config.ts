import 'dotenv/config'
import { defineConfig } from 'prisma/config'

// During Docker build, DATABASE_URL may not be available
// Prisma generate doesn't need a real connection, just the schema
// Use provided database URL or fallback to actual database URL if not set
const databaseUrl = process.env.DATABASE_URL || 'postgresql://postgres:TGlahexkFWDUIbBOxJKxmTyPPvnSdrIj@shuttle.proxy.rlwy.net:41247/railway'

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: databaseUrl,
  },
})
