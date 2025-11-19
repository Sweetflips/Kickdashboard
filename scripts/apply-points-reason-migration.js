// Try to load .env.local for local development, but don't fail if it doesn't exist
// In production (Railway), environment variables are already available
try {
  require('dotenv').config({ path: '.env.local' })
} catch (e) {
  // Ignore - env vars may already be set (production)
}

const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

async function applyMigration() {
  try {
    console.log('🔄 Applying points_reason migration...\n')

    // Check if column already exists
    const checkResult = await prisma.$queryRaw`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'chat_messages' AND column_name = 'points_reason'
    `

    if (Array.isArray(checkResult) && checkResult.length > 0) {
      console.log('✅ Column already exists - migration already applied\n')
      return
    }

    // Apply the migration directly
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "chat_messages" ADD COLUMN IF NOT EXISTS "points_reason" TEXT;
    `)

    console.log('✅ Migration applied successfully!')
    console.log('✅ Added points_reason column to chat_messages table\n')

  } catch (error) {
    if (error.message.includes('already exists') || error.message.includes('duplicate column')) {
      console.log('✅ Migration already applied (column exists)\n')
    } else {
      console.error('❌ Migration failed:', error.message)
      throw error
    }
  } finally {
    await prisma.$disconnect()
  }
}

applyMigration()
  .then(() => {
    console.log('✅ Migration script completed')
    process.exit(0)
  })
  .catch((error) => {
    console.error('❌ Migration script failed:', error)
    process.exit(1)
  })
