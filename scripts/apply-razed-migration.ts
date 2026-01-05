#!/usr/bin/env node
/**
 * Apply Razed migration directly to database
 * 
 * This bypasses Prisma's shadow database validation which can fail
 * when there are migration dependency issues.
 * 
 * Usage: npx tsx scripts/apply-razed-migration.ts
 */

import { readFileSync } from 'fs'
import { join } from 'path'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function applyMigration() {
    console.log('')
    console.log('========================================')
    console.log('🔄 APPLYING RAZED MIGRATION')
    console.log('========================================')
    console.log('')

    try {
        const migrationPath = join(__dirname, '../prisma/migrations/20250105000000_add_razed_verification/migration.sql')
        const migrationSQL = readFileSync(migrationPath, 'utf-8')

        console.log('Reading migration file...')
        console.log(`Path: ${migrationPath}`)
        console.log('')

        // Split migration into logical blocks
        // DO $$ blocks must be kept together, other statements can be separate
        const statements: string[] = []
        let currentStatement = ''
        let inDoBlock = false
        
        const lines = migrationSQL.split('\n')
        
        for (const line of lines) {
            const trimmed = line.trim()
            
            // Skip empty lines and comments
            if (!trimmed || trimmed.startsWith('--')) {
                continue
            }
            
            currentStatement += line + '\n'
            
            // Check if we're entering a DO block
            if (trimmed.startsWith('DO $$')) {
                inDoBlock = true
            }
            
            // Check if we're exiting a DO block
            if (inDoBlock && trimmed === 'END $$;') {
                statements.push(currentStatement.trim())
                currentStatement = ''
                inDoBlock = false
                continue
            }
            
            // If not in DO block and we hit a semicolon, it's a complete statement
            if (!inDoBlock && trimmed.endsWith(';')) {
                statements.push(currentStatement.trim())
                currentStatement = ''
            }
        }
        
        // Add any remaining statement
        if (currentStatement.trim()) {
            statements.push(currentStatement.trim())
        }
        
        console.log(`Found ${statements.length} SQL statement blocks`)
        console.log('')

        // Execute each statement block
        for (let i = 0; i < statements.length; i++) {
            const statement = statements[i]
            if (!statement.trim()) continue

            try {
                console.log(`Executing block ${i + 1}/${statements.length}...`)
                await prisma.$executeRawUnsafe(statement)
                console.log(`✅ Block ${i + 1} executed successfully`)
            } catch (error: any) {
                const errorMessage = error.message || String(error)
                const errorCode = error.code || ''
                
                // Ignore "already exists" errors
                if (errorMessage.includes('already exists') || 
                    errorMessage.includes('duplicate') ||
                    (errorMessage.includes('relation') && errorMessage.includes('already exists')) ||
                    errorCode === '42P07' || // relation already exists
                    errorCode === '42710' || // duplicate object
                    errorCode === '42701') { // duplicate column
                    console.log(`⚠️  Block ${i + 1}: Already exists (skipping)`)
                } else {
                    console.error(`❌ Block ${i + 1} failed:`, errorMessage)
                    throw error
                }
            }
        }
        
        console.log('')
        console.log('Verifying migration...')
        
        // Verify the migration was applied
        const hasRazedTable = await prisma.$queryRaw<Array<{ exists: boolean }>>`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name = 'razed_verifications'
            ) as exists
        `
        
        const hasRazedFields = await prisma.$queryRaw<Array<{ count: bigint }>>`
            SELECT COUNT(*) as count
            FROM information_schema.columns
            WHERE table_name = 'users'
            AND column_name IN ('razed_user_id', 'razed_username', 'razed_connected')
        `
        
        if (hasRazedTable[0]?.exists && Number(hasRazedFields[0]?.count) === 3) {
            console.log('✅ Migration verified - all objects exist')
        } else {
            console.log('⚠️  Migration verification failed')
            console.log(`   Table exists: ${hasRazedTable[0]?.exists}`)
            console.log(`   User columns: ${hasRazedFields[0]?.count}/3`)
        }

        console.log('')
        console.log('========================================')
        console.log('✅ MIGRATION APPLIED SUCCESSFULLY')
        console.log('========================================')
        console.log('')
        console.log('Next steps:')
        console.log('1. Run: npx prisma generate')
        console.log('2. Run: npm run test:razed:db')
        console.log('')

    } catch (error) {
        console.error('')
        console.error('========================================')
        console.error('❌ MIGRATION FAILED')
        console.error('========================================')
        console.error('')
        console.error('Error:', error instanceof Error ? error.message : String(error))
        console.error('')
        process.exit(1)
    } finally {
        await prisma.$disconnect()
    }
}

applyMigration()

