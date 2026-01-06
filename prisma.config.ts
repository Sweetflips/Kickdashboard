import 'dotenv/config'
import { defineConfig } from 'prisma/config'

// Use a placeholder URL if DATABASE_URL is not set (e.g., during build)
// Prisma generate does not connect to the database, it only needs the schema
const databaseUrl = process.env.DATABASE_URL || 'postgresql://placeholder:placeholder@localhost:5432/placeholder'

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: databaseUrl,
  },
})
