import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { withAccelerate } from '@prisma/extension-accelerate'

async function testConnection() {
  console.log('🧪 Testing Prisma Accelerate connection...\n')

  const databaseUrl = process.env.DATABASE_URL || ''
  const isAccelerate = databaseUrl.startsWith('prisma://') || databaseUrl.startsWith('prisma+postgres://')

  console.log(`DATABASE_URL type: ${isAccelerate ? 'Accelerate' : 'Direct PostgreSQL'}`)
  console.log(`URL preview: ${databaseUrl.substring(0, 50)}...\n`)

  const clientConfig: any = {
    log: [],
    transactionOptions: {
      maxWait: 5000,
      timeout: 15000,
    },
  }

  if (isAccelerate) {
    clientConfig.accelerateUrl = databaseUrl
  } else {
    throw new Error('Direct PostgreSQL connections require @prisma/adapter-pg')
  }

  const prisma = new PrismaClient(clientConfig).$extends(withAccelerate())

  try {
    // Test 1: Raw query to verify connection
    console.log('1️⃣ Testing raw SQL query...')
    const result = await prisma.$queryRaw`SELECT 1 as test`
    console.log(`✅ Raw query successful:`, result)

    // Test 2: Check if _prisma_migrations table exists (indicates migrations have run)
    console.log('\n2️⃣ Checking migration status...')
    try {
      const migrations = await prisma.$queryRaw`
        SELECT COUNT(*) as count FROM _prisma_migrations
      `
      console.log(`✅ Migrations table exists:`, migrations)
    } catch (e: any) {
      if (e.code === 'P2021' || e.message?.includes('does not exist')) {
        console.log('⚠️  Migrations table not found - database needs migrations')
      } else {
        throw e
      }
    }

    console.log('\n✅ Connection test passed!')
    console.log('📝 Next step: Run migrations with `npx prisma migrate deploy`')

  } catch (error: any) {
    console.error('❌ Connection test failed:', error.message)
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

testConnection().catch(console.error)
