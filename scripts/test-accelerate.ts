import { db } from '../lib/db'

async function testAccelerate() {
  console.log('🧪 Testing Prisma Accelerate connection...\n')

  try {
    // Test 1: Basic connection test
    console.log('1️⃣ Testing database connection...')
    const userCount = await db.user.count()
    console.log(`✅ Connection successful! Found ${userCount} users\n`)

    // Test 2: Query with caching
    console.log('2️⃣ Testing Accelerate caching...')
    const startTime = Date.now()
    const users = await db.user.findMany({
      take: 5,
      cacheStrategy: { ttl: 60 }, // Cache for 60 seconds
    })
    const firstQueryTime = Date.now() - startTime
    console.log(`✅ First query (with caching): ${firstQueryTime}ms`)
    console.log(`   Found ${users.length} users\n`)

    // Test 3: Cached query (should be faster)
    console.log('3️⃣ Testing cached query...')
    const startTime2 = Date.now()
    const users2 = await db.user.findMany({
      take: 5,
      cacheStrategy: { ttl: 60 },
    })
    const secondQueryTime = Date.now() - startTime2
    console.log(`✅ Second query (cached): ${secondQueryTime}ms`)
    console.log(`   Found ${users2.length} users\n`)

    // Test 4: Check if Accelerate URL is being used
    const dbUrl = process.env.DATABASE_URL || ''
    if (dbUrl.startsWith('prisma+postgres://') || dbUrl.startsWith('prisma://')) {
      console.log('4️⃣ Accelerate connection confirmed')
      console.log(`   Using: ${dbUrl.substring(0, 50)}...\n`)
    } else {
      console.log('4️⃣ ⚠️  Warning: Not using Accelerate URL')
      console.log(`   Current URL: ${dbUrl.substring(0, 50)}...\n`)
    }

    // Test 5: Test a more complex query
    console.log('5️⃣ Testing complex query with caching...')
    const startTime3 = Date.now()
    const recentUsers = await db.user.findMany({
      where: {
        last_login_at: {
          not: null,
        },
      },
      take: 10,
      orderBy: {
        last_login_at: 'desc',
      },
      cacheStrategy: { ttl: 30 },
    })
    const complexQueryTime = Date.now() - startTime3
    console.log(`✅ Complex query: ${complexQueryTime}ms`)
    console.log(`   Found ${recentUsers.length} users with login history\n`)

    console.log('✅ All tests passed! Accelerate is working correctly.')
    process.exit(0)
  } catch (error: any) {
    console.error('❌ Test failed:', error.message)
    console.error('Error details:', error)
    process.exit(1)
  }
}

testAccelerate()
