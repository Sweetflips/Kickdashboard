require('dotenv').config({ path: '.env.local' })
const { PrismaClient } = require('@prisma/client')
const fs = require('fs')
const path = require('path')

const prisma = new PrismaClient()

async function runMigration() {
    try {
        console.log('🔄 Running simplify giveaway migration...')
        console.log('📋 Adding prize_amount and number_of_winners columns...')

        const migrationSQL = fs.readFileSync(
            path.join(__dirname, '..', 'prisma', 'migrations', '20250101000008_simplify_giveaway', 'migration.sql'),
            'utf-8'
        )

        // Split SQL into individual statements
        const statements = migrationSQL
            .split(/;\s*\n/)
            .map(s => {
                return s.split('\n')
                    .filter(line => !line.trim().startsWith('--'))
                    .join('\n')
                    .trim()
            })
            .filter(s => s.length > 0)

        console.log(`📝 Found ${statements.length} SQL statements to execute`)

        // Execute each statement
        for (let i = 0; i < statements.length; i++) {
            const statement = statements[i]
            if (statement) {
                try {
                    const cleanStatement = statement.split('--')[0].trim()
                    if (cleanStatement) {
                        console.log(`  Executing statement ${i + 1}/${statements.length}...`)
                        await prisma.$executeRawUnsafe(cleanStatement + ';')
                        console.log(`  ✅ Statement ${i + 1} executed successfully`)
                    }
                } catch (error) {
                    // Ignore "already exists" errors for columns
                    if (error.message && (
                        error.message.includes('already exists') ||
                        error.message.includes('duplicate') ||
                        error.code === '42701' // PostgreSQL column already exists
                    )) {
                        console.log(`  ⚠️  Statement ${i + 1} skipped (column already exists)`)
                    } else {
                        console.error(`  ❌ Error in statement ${i + 1}:`, error.message)
                        throw error
                    }
                }
            }
        }

        console.log('\n✅ Migration completed successfully!')
        console.log('')
        console.log('⚠️  Please run "npx prisma generate" to update Prisma client')
        console.log('')

    } catch (error) {
        console.error('❌ Migration failed:', error)
        process.exit(1)
    } finally {
        await prisma.$disconnect()
    }
}

runMigration()
















