/**
 * Detailed analysis of unique chatters in a session
 * Usage: node scripts/analyze-session-chatters.js [session_id]
 */

const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function analyzeSessionChatters(sessionId = null) {
    try {
        let session

        if (sessionId) {
            session = await prisma.streamSession.findUnique({
                where: { id: BigInt(sessionId) },
            })
        } else {
            // Find active session
            session = await prisma.streamSession.findFirst({
                where: { ended_at: null },
                orderBy: { started_at: 'desc' },
            })
        }

        if (!session) {
            console.error('❌ Session not found')
            process.exit(1)
        }

        console.log(`\n📊 Analyzing Session ${session.id}:`)
        console.log(`   Title: ${session.session_title || 'Untitled'}`)
        console.log(`   Started: ${session.started_at.toISOString()}`)
        console.log(`   Channel: ${session.channel_slug}`)

        // Get all valid messages
        const validMessages = await prisma.chatMessage.findMany({
            where: {
                stream_session_id: session.id,
                sender_user_id: { gt: BigInt(0) },
                created_at: { gte: session.started_at },
                sent_when_offline: false,
            },
            select: {
                sender_user_id: true,
                sender_username: true,
                created_at: true,
            },
            orderBy: {
                created_at: 'asc',
            },
        })

        console.log(`\n📨 Total valid messages: ${validMessages.length}`)

        // Count unique chatters
        const uniqueUserIds = new Set(validMessages.map(m => m.sender_user_id.toString()))
        console.log(`\n👥 Unique chatters (by user_id): ${uniqueUserIds.size}`)

        // Count by username (to see if there are duplicate usernames with different IDs)
        const uniqueUsernames = new Set(validMessages.map(m => m.sender_username.toLowerCase()))
        console.log(`   Unique usernames: ${uniqueUsernames.size}`)

        // Find users with multiple user IDs (same username, different ID)
        const usernameToUserIds = new Map()
        validMessages.forEach(msg => {
            const usernameLower = msg.sender_username.toLowerCase()
            if (!usernameToUserIds.has(usernameLower)) {
                usernameToUserIds.set(usernameLower, new Set())
            }
            usernameToUserIds.get(usernameLower).add(msg.sender_user_id.toString())
        })

        const duplicateUsernames = Array.from(usernameToUserIds.entries())
            .filter(([username, userIds]) => userIds.size > 1)
            .sort((a, b) => b[1].size - a[1].size)

        if (duplicateUsernames.length > 0) {
            console.log(`\n⚠️  Found ${duplicateUsernames.length} usernames with multiple user IDs:`)
            duplicateUsernames.slice(0, 10).forEach(([username, userIds]) => {
                console.log(`   - ${username}: ${Array.from(userIds).join(', ')}`)
            })
            if (duplicateUsernames.length > 10) {
                console.log(`   ... and ${duplicateUsernames.length - 10} more`)
            }
        }

        // Check for messages from before session started (shouldn't exist but check anyway)
        const beforeStart = await prisma.chatMessage.count({
            where: {
                stream_session_id: session.id,
                created_at: { lt: session.started_at },
            },
        })

        if (beforeStart > 0) {
            console.log(`\n⚠️  Found ${beforeStart} messages created before session started`)
        }

        // Check for invalid user IDs
        const invalidUserIds = await prisma.chatMessage.count({
            where: {
                stream_session_id: session.id,
                sender_user_id: { lte: BigInt(0) },
            },
        })

        if (invalidUserIds > 0) {
            console.log(`\n⚠️  Found ${invalidUserIds} messages with invalid user IDs`)
        }

        // Show message count per user (top 20)
        const userMessageCounts = new Map()
        validMessages.forEach(msg => {
            const userId = msg.sender_user_id.toString()
            userMessageCounts.set(userId, (userMessageCounts.get(userId) || 0) + 1)
        })

        const topChatters = Array.from(userMessageCounts.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 20)

        console.log(`\n📈 Top 20 chatters by message count:`)
        for (const [userId, count] of topChatters) {
            const user = validMessages.find(m => m.sender_user_id.toString() === userId)
            console.log(`   ${user?.sender_username || 'Unknown'} (ID: ${userId}): ${count} messages`)
        }

        console.log(`\n✅ Analysis complete`)
        console.log(`   Unique chatters: ${uniqueUserIds.size}`)
        console.log(`   This is the correct count based on unique user IDs`)

    } catch (error) {
        console.error('❌ Error:', error)
        process.exit(1)
    } finally {
        await prisma.$disconnect()
    }
}

const sessionId = process.argv[2]
analyzeSessionChatters(sessionId)

