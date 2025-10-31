require('dotenv').config({ path: '.env.local' })
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

async function checkTables() {
  try {
    console.log('🔍 Checking if giveaway tables exist...')

    // Try to query the giveaways table
    const result = await prisma.$queryRawUnsafe(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name IN ('giveaways', 'giveaway_segments', 'giveaway_entries', 'giveaway_winners')
      ORDER BY table_name;
    `)

    console.log('Existing tables:', result)

    const tableNames = result.map(r => r.table_name)
    const expectedTables = ['giveaways', 'giveaway_segments', 'giveaway_entries', 'giveaway_winners']
    const missingTables = expectedTables.filter(t => !tableNames.includes(t))

    if (missingTables.length > 0) {
      console.log('❌ Missing tables:', missingTables)
      return false
    } else {
      console.log('✅ All tables exist!')
      return true
    }
  } catch (error) {
    console.error('Error checking tables:', error)
    return false
  } finally {
    await prisma.$disconnect()
  }
}

checkTables().then(exists => {
  if (!exists) {
    console.log('\n⚠️  Tables are missing. Please run the migration.')
    process.exit(1)
  } else {
    console.log('\n✅ Database is up to date!')
    process.exit(0)
  }
})
