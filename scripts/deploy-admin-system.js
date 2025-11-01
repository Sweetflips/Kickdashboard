const { PrismaClient } = require('@prisma/client')
const fs = require('fs')
const path = require('path')

const prisma = new PrismaClient()

async function deployAdminSystem() {
  try {
    console.log('🚀 Starting admin system deployment...\n')

    // Step 1: Run migration
    console.log('📦 Step 1: Running database migration...')
    try {
      // Check if column already exists
      const checkColumn = await prisma.$queryRaw`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name='users' AND column_name='is_admin'
      `

      if (checkColumn && checkColumn.length > 0) {
        console.log('✅ Migration already applied (column exists)\n')
      } else {
        const migrationSQL = fs.readFileSync(
          path.join(__dirname, '..', 'prisma', 'migrations', '20250101000010_add_is_admin', 'migration.sql'),
          'utf-8'
        )

        await prisma.$executeRawUnsafe(migrationSQL)
        console.log('✅ Migration completed successfully!\n')
      }
    } catch (error) {
      if (error.message.includes('already exists') || error.message.includes('duplicate column')) {
        console.log('✅ Migration already applied (column exists)\n')
      } else if (error.message.includes('too many clients')) {
        console.log('⚠️  Database connection limit reached. Please wait a moment and try again.')
        console.log('Or run this via Railway web interface shell.\n')
        throw error
      } else {
        throw error
      }
    }

    // Step 2: Grant admin access
    console.log('👤 Step 2: Granting admin access to amorsweetflips...')
    const username = 'amorsweetflips'

    const user = await prisma.user.updateMany({
      where: {
        username: {
          equals: username,
          mode: 'insensitive',
        },
      },
      data: {
        is_admin: true,
      },
    })

    if (user.count === 0) {
      console.log(`⚠️  User "${username}" not found in database.`)
      console.log('Make sure the user has logged in at least once.')
      console.log('✅ Migration completed, but admin grant skipped.\n')
    } else {
      console.log(`✅ Successfully granted admin access to "${username}"\n`)
    }

    console.log('🎉 Admin system deployment completed!')
    console.log('\nNext steps:')
    console.log('1. Restart your Railway service (if needed)')
    console.log('2. Verify admin access by logging in as amorsweetflips')
    console.log('3. Check that admin links appear in the sidebar')

  } catch (error) {
    console.error('❌ Deployment failed:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

deployAdminSystem()
