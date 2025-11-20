/**
 * Diagnostic script to check messages assigned to a stream session
 * Usage: node scripts/check-session-messages.js <session_id>
 */

const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function checkSessionMessages(sessionId) {
    try {
        const sessionIdBigInt = BigInt(sessionId)

        // Get session info
        const session = await prisma.streamSession.findUnique({
            where: { id: sessionIdBigInt },
            select: {
                id: true,
                session_title: true,
                started_at: true,
                ended_at: true,
                channel_slug: true,
            },
        })

        if (!session) {
            console.error(`❌ Session ${sessionId} not found`)
            process.exit(1)
        }

        console.log(`\n📊 Session Info:`)
        console.log(`   ID: ${session.id}`)
        console.log(`   Title: ${session.session_title || 'Untitled'}`)
        console.log(`   Channel: ${session.channel_slug}`)
        console.log(`   Started: ${session.started_at.toISOString()}`)
        console.log(`   Ended: ${session.ended_at ? session.ended_at.toISOString() : 'Still active'}`)

        // Get ALL messages assigned to this session (no filters)
        const allMessages = await prisma.chatMessage.findMany({
            where: {
                stream_session_id: sessionIdBigInt,
            },
            select: {
                id: true,
                message_id: true,
                sender_user_id: true,
                sender_username: true,
                created_at: true,
                sent_when_offline: true,
                timestamp: true,
            },
            orderBy: {
                created_at: 'asc',
            },
        })

        console.log(`\n📨 Total messages assigned to session: ${allMessages.length}`)

        // Filter messages
        const validMessages = allMessages.filter(msg => {
            const isValidUserId = msg.sender_user_id > BigInt(0)
            const isAfterStart = new Date(msg.created_at) >= session.started_at
            const isNotOffline = !msg.sent_when_offline
            return isValidUserId && isAfterStart && isNotOffline
        })

        const invalidUserId = allMessages.filter(msg => msg.sender_user_id <= BigInt(0))
        const beforeStart = allMessages.filter(msg => new Date(msg.created_at) < session.started_at)
        const offline = allMessages.filter(msg => msg.sent_when_offline)

        console.log(`\n✅ Valid messages (for counting): ${validMessages.length}`)
        console.log(`   - Valid user ID (> 0): ${allMessages.filter(m => m.sender_user_id > BigInt(0)).length}`)
        console.log(`   - After session start: ${allMessages.filter(m => new Date(m.created_at) >= session.started_at).length}`)
        console.log(`   - Not offline: ${allMessages.filter(m => !m.sent_when_offline).length}`)

        console.log(`\n❌ Invalid messages:`)
        console.log(`   - Invalid user ID (<= 0): ${invalidUserId.length}`)
        console.log(`   - Created before session start: ${beforeStart.length}`)
        console.log(`   - Sent when offline: ${offline.length}`)

        // Count unique chatters
        const uniqueChattersAll = new Set(allMessages.map(m => m.sender_user_id.toString())).size
        const uniqueChattersValid = new Set(validMessages.map(m => m.sender_user_id.toString())).size

        console.log(`\n👥 Unique chatters:`)
        console.log(`   - All messages: ${uniqueChattersAll}`)
        console.log(`   - Valid messages only: ${uniqueChattersValid}`)

        // Show some examples of invalid messages
        if (beforeStart.length > 0) {
            console.log(`\n⚠️  Sample messages created BEFORE session started:`)
            beforeStart.slice(0, 5).forEach(msg => {
                console.log(`   - ${msg.sender_username} (ID: ${msg.sender_user_id}) at ${msg.created_at.toISOString()}`)
            })
            if (beforeStart.length > 5) {
                console.log(`   ... and ${beforeStart.length - 5} more`)
            }
        }

        if (invalidUserId.length > 0) {
            console.log(`\n⚠️  Sample messages with invalid user IDs:`)
            invalidUserId.slice(0, 5).forEach(msg => {
                console.log(`   - ${msg.sender_username} (ID: ${msg.sender_user_id}) at ${msg.created_at.toISOString()}`)
            })
            if (invalidUserId.length > 5) {
                console.log(`   ... and ${invalidUserId.length - 5} more`)
            }
        }

        // Show message distribution over time
        const messagesByHour = {}
        validMessages.forEach(msg => {
            const hour = new Date(msg.created_at).toISOString().substring(0, 13) + ':00:00'
            messagesByHour[hour] = (messagesByHour[hour] || 0) + 1
        })

        console.log(`\n📈 Message distribution (valid messages only):`)
        Object.entries(messagesByHour)
            .sort(([a], [b]) => a.localeCompare(b))
            .slice(0, 10)
            .forEach(([hour, count]) => {
                console.log(`   ${hour}: ${count} messages`)
            })

        console.log(`\n✅ Expected unique chatters count: ${uniqueChattersValid}`)
        console.log(`\n`)

    } catch (error) {
        console.error('❌ Error:', error)
        process.exit(1)
    } finally {
        await prisma.$disconnect()
    }
}

// Get session ID from command line
const sessionId = process.argv[2]

if (!sessionId) {
    console.error('Usage: node scripts/check-session-messages.js <session_id>')
    console.error('Example: node scripts/check-session-messages.js 123456789')
    process.exit(1)
}

checkSessionMessages(sessionId)

