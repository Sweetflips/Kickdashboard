const { PrismaClient } = require('@prisma/client')
const fs = require('fs')
const path = require('path')

const prisma = new PrismaClient()

async function runMigration() {
  try {
    console.log('🔄 Running points_reason migration...\n')

    // Check if column already exists
    const checkColumn = await prisma.$queryRaw`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name='chat_messages' AND column_name='points_reason'
    `

    if (checkColumn && checkColumn.length > 0) {
      console.log('✅ Migration already applied (column exists)\n')
      return
    }

    const migrationSQL = fs.readFileSync(
      path.join(__dirname, '..', 'prisma', 'migrations', '20250101000013_add_points_reason', 'migration.sql'),
      'utf-8'
    )

    await prisma.$executeRawUnsafe(migrationSQL)
    console.log('✅ Migration completed successfully!')
    console.log('✅ Added points_reason column to chat_messages table\n')

  } catch (error) {
    if (error.message.includes('already exists') || error.message.includes('duplicate column')) {
      console.log('✅ Migration already applied (column exists)\n')
    } else if (error.message.includes('too many clients')) {
      console.log('⚠️  Database connection limit reached. Please wait a moment and try again.')
      console.log('Or run this via Railway web interface shell.\n')
      throw error
    } else {
      console.error('❌ Migration failed:', error)
      throw error
    }
  } finally {
    await prisma.$disconnect()
  }
}

runMigration()
  .then(() => {
    console.log('✅ Migration script completed')
    process.exit(0)
  })
  .catch((error) => {
    console.error('❌ Migration script failed:', error)
    process.exit(1)
  })
