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
            const messageCount = await prisma.chatMessage.count({
                where: { stream_session_id: session.id },
            })

            await prisma.streamSession.update({
                where: { id: session.id },
                data: {
                    ended_at: new Date(),
                    total_messages: messageCount,
                    updated_at: new Date(),
                },
            })

            console.log(`✅ Ended session ${session.id.toString()} (${messageCount} messages)`)
        }

        console.log(`\n✅ All active sessions have been ended`)
    } catch (error) {
        console.error('❌ Error ending sessions:', error)
    } finally {
        await prisma.$disconnect()
    }
}

endActiveSessions()
