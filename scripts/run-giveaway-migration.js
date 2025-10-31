require('dotenv').config({ path: '.env.local' })
const { PrismaClient } = require('@prisma/client')
const fs = require('fs')
const path = require('path')

const prisma = new PrismaClient()

async function runMigration() {
    try {
        console.log('🔄 Running giveaway system migration...')
        console.log('📋 Database URL:', process.env.DATABASE_URL ? 'Set' : 'Not set')

        const migrationSQL = fs.readFileSync(
            path.join(__dirname, '..', 'prisma', 'migrations', '20250101000005_add_giveaway_system', 'migration.sql'),
            'utf-8'
        )

        // Split SQL into individual statements - handle multi-line statements properly
        const statements = migrationSQL
            .split(/;\s*\n/)
            .map(s => {
                // Remove comment lines (lines starting with --)
                return s.split('\n')
                    .filter(line => !line.trim().startsWith('--'))
                    .join('\n')
                    .trim()
            })
            .filter(s => s.length > 0)

        console.log(`📝 Found ${statements.length} SQL statements to execute`)

        // Execute each statement individually with error handling
        for (let i = 0; i < statements.length; i++) {
            const statement = statements[i]
            if (statement) {
                try {
                    console.log(`  Executing statement ${i + 1}/${statements.length}...`)
                    // Remove any trailing comments
                    const cleanStatement = statement.split('--')[0].trim()
                    if (cleanStatement) {
                        await prisma.$executeRawUnsafe(cleanStatement + ';')
                    }
                } catch (error) {
                    // Ignore "already exists" errors
                    if (error.message && (
                        error.message.includes('already exists') ||
                        error.message.includes('duplicate') ||
                        error.code === '42P07' // PostgreSQL table already exists
                    )) {
                        console.log(`  ⚠️  Statement ${i + 1} skipped (already exists)`)
                    } else {
                        console.error(`  ❌ Error in statement ${i + 1}:`, error.message)
                        console.error(`  Statement preview: ${statement.substring(0, 150)}...`)
                        throw error
                    }
                }
            }
        }

        // Verify tables were created
        console.log('\n🔍 Verifying tables were created...')
        const result = await prisma.$queryRawUnsafe(`
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'public'
            AND table_name IN ('giveaways', 'giveaway_segments', 'giveaway_entries', 'giveaway_winners')
            ORDER BY table_name;
        `)

        const tableNames = result.map(r => r.table_name)
        const expectedTables = ['giveaways', 'giveaway_segments', 'giveaway_entries', 'giveaway_winners']
        const missingTables = expectedTables.filter(t => !tableNames.includes(t))

        if (missingTables.length > 0) {
            throw new Error(`Tables not created: ${missingTables.join(', ')}`)
        }

        console.log('✅ Migration completed successfully!')
        console.log('✅ All tables verified:', tableNames.join(', '))
        console.log('')
        console.log('⚠️  Please run "npx prisma generate" if you haven\'t already')

    } catch (error) {
        console.error('❌ Migration failed:', error)
        process.exit(1)
    } finally {
        await prisma.$disconnect()
    }
}

runMigration()
