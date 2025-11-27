const { PrismaClient } = require('@prisma/client')
const fs = require('fs')

// Use the provided database URL
const prisma = new PrismaClient({
    datasources: {
        db: {
            url: 'postgresql://postgres:uodQAUPrNwNEfJWVPwOQNYlBtWYvimQD@mainline.proxy.rlwy.net:46309/railway'
        }
    }
})

async function runMigration() {
    const logFile = 'migration-result.txt'
    try {
        const message = 'Creating unique index for active stream sessions...\n'
        fs.appendFileSync(logFile, message)

        await prisma.$executeRawUnsafe(`
            CREATE UNIQUE INDEX IF NOT EXISTS "stream_sessions_broadcaster_user_id_active_unique"
            ON "stream_sessions"("broadcaster_user_id")
            WHERE "ended_at" IS NULL;
        `)

        const successMsg = '✅ Unique index created successfully!\n'
        fs.appendFileSync(logFile, successMsg)
        process.exit(0)
    } catch (error) {
        const errorMsg = `❌ Error creating index: ${error.message}\n`
        fs.appendFileSync(logFile, errorMsg)
        process.exit(1)
    } finally {
        await prisma.$disconnect()
    }
}

runMigration()
