const { PrismaClient } = require('@prisma/client')
const fs = require('fs')
const path = require('path')

const prisma = new PrismaClient()

async function runMigration() {
    try {
        console.log('🔄 Running connected accounts migration...')

        const migrationSQL = fs.readFileSync(
            path.join(__dirname, '..', 'run_migration.sql'),
            'utf-8'
        )

        // Execute the migration SQL
        await prisma.$executeRawUnsafe(migrationSQL)

        console.log('✅ Migration completed successfully!')
        console.log('')
        console.log('⚠️  Please run "npx prisma generate" manually after stopping your dev server')
        console.log('')
        console.log('Next steps:')
        console.log('1. Stop your Next.js dev server (if running)')
        console.log('2. Run: npx prisma generate')
        console.log('3. Restart your dev server')
        console.log('4. Try connecting Discord again')

    } catch (error) {
        console.error('❌ Migration failed:', error)
        process.exit(1)
    } finally {
        await prisma.$disconnect()
    }
}

runMigration()
