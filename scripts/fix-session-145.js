/**
 * Fix incorrect session duration
 * Updates session 145 to correct 4-hour duration
 */

require('dotenv').config()
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function fixSessionDuration() {
    try {
        const sessionId = 145n
        
        // Get the session
        const session = await prisma.streamSession.findUnique({
            where: { id: sessionId }
        })
        
        if (!session) {
            console.log('❌ Session not found')
            return
        }
        
        console.log('Current session data:')
        console.log('  Started:', session.started_at.toISOString())
        console.log('  Ended:', session.ended_at?.toISOString() || 'Not ended')
        console.log('  Duration:', session.duration_seconds ? `${Math.floor(session.duration_seconds / 3600)}h ${Math.floor((session.duration_seconds % 3600) / 60)}m` : 'Not set')
        console.log('  Messages:', session.total_messages)
        
        // Set correct 4-hour duration (4 * 60 * 60 = 14400 seconds)
        const correctDurationSeconds = 4 * 60 * 60
        const correctEndTime = new Date(session.started_at.getTime() + (correctDurationSeconds * 1000))
        
        console.log('\nUpdating to correct values:')
        console.log('  New end time:', correctEndTime.toISOString())
        console.log('  New duration: 4h 0m (14400 seconds)')
        
        await prisma.streamSession.update({
            where: { id: sessionId },
            data: {
                ended_at: correctEndTime,
                duration_seconds: correctDurationSeconds,
                updated_at: new Date()
            }
        })
        
        console.log('\n✅ Session updated successfully')
        
    } catch (error) {
        console.error('❌ Error:', error)
        process.exit(1)
    } finally {
        await prisma.$disconnect()
    }
}

fixSessionDuration()
