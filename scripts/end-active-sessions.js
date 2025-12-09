require('dotenv').config()
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

async function endActiveSessions() {
    try {
        // Find all active sessions
        const activeSessions = await prisma.streamSession.findMany({
            where: {
                ended_at: null,
            },
        })

        console.log(`Found ${activeSessions.length} active session(s)`)

        for (const session of activeSessions) {
            const startTime = new Date(session.started_at).getTime()
            const now = Date.now()
            const durationMs = now - startTime
            const durationSeconds = Math.floor(durationMs / 1000)
            const durationHours = Math.floor(durationSeconds / 3600)
            const durationMinutes = Math.floor((durationSeconds % 3600) / 60)
            
            const messageCount = await prisma.chatMessage.count({
                where: { stream_session_id: session.id },
            })

            console.log(`\n📊 Session ${session.id.toString()}:`)
            console.log(`   Channel: ${session.channel_slug}`)
            console.log(`   Started: ${session.started_at.toISOString()}`)
            console.log(`   Duration: ${durationHours}h ${durationMinutes}m`)
            console.log(`   Messages: ${messageCount}`)
            console.log(`   Peak viewers: ${session.peak_viewer_count}`)

            await prisma.streamSession.update({
                where: { id: session.id },
                data: {
                    ended_at: new Date(),
                    total_messages: messageCount,
                    duration_seconds: durationSeconds,
                    updated_at: new Date(),
                },
            })

            console.log(`   ✅ Session ended`)
        }

        console.log(`\n✅ All active sessions have been ended`)
    } catch (error) {
        console.error('❌ Error ending sessions:', error)
    } finally {
        await prisma.$disconnect()
    }
}

endActiveSessions()
