/**
 * Add duration_seconds column to stream_sessions table
 */

require('dotenv').config()
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function addDurationColumn() {
    try {
        console.log('Adding duration_seconds column to stream_sessions table...\n')
        
        await prisma.$executeRawUnsafe(`
            ALTER TABLE stream_sessions 
            ADD COLUMN IF NOT EXISTS duration_seconds INTEGER;
        `)
        
        console.log('✅ Column added successfully')
        
        // Now regenerate Prisma client
        console.log('\nRegenerating Prisma client...')
        await prisma.$disconnect()
        
        const { execSync } = require('child_process')
        execSync('npx prisma generate', { stdio: 'inherit' })
        
        console.log('\n✅ Setup complete! You can now run end-active-sessions.js')
        
    } catch (error) {
        if (error.message?.includes('already exists')) {
            console.log('✅ Column already exists')
        } else {
            console.error('❌ Error:', error)
            process.exit(1)
        }
    } finally {
        await prisma.$disconnect()
    }
}

addDurationColumn()
