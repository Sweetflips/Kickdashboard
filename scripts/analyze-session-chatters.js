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
        console.log(`   Ended: ${session.ended_at ? session.ended_at.toISOString() : 'Still active'}`)
        console.log(`   Channel: ${session.channel_slug}`)

        // ===== STAGE 1: Get ALL messages assigned to this session (no filters) =====
        const allAssignedMessages = await prisma.chatMessage.findMany({
            where: {
                stream_session_id: session.id,
            },
            select: {
                id: true,
                message_id: true,
                sender_user_id: true,
                sender_username: true,
                created_at: true,
                timestamp: true,
                sent_when_offline: true,
            },
            orderBy: {
                created_at: 'asc',
            },
        })

        console.log(`\n📊 STAGE 1: Raw data collection`)
        console.log(`   Total messages assigned to session: ${allAssignedMessages.length}`)

        // ===== STAGE 2: Filter by user ID validity =====
        const messagesWithValidUserId = allAssignedMessages.filter(
            msg => msg.sender_user_id > BigInt(0)
        )
        const invalidUserIdCount = allAssignedMessages.length - messagesWithValidUserId.length

        console.log(`\n📊 STAGE 2: User ID validation`)
        console.log(`   Messages with valid user_id (> 0): ${messagesWithValidUserId.length}`)
        console.log(`   Messages with invalid user_id (<= 0): ${invalidUserIdCount}`)

        // ===== STAGE 3: Filter by session start time =====
        const messagesAfterStart = messagesWithValidUserId.filter(
            msg => new Date(msg.created_at) >= session.started_at
        )
        const beforeStartCount = messagesWithValidUserId.length - messagesAfterStart.length

        console.log(`\n📊 STAGE 3: Session time boundary check`)
        console.log(`   Messages after session start: ${messagesAfterStart.length}`)
        console.log(`   Messages before session start: ${beforeStartCount}`)

        if (beforeStartCount > 0) {
            console.log(`\n⚠️  WARNING: Found ${beforeStartCount} messages with timestamps BEFORE session started!`)
            const beforeStartSamples = messagesWithValidUserId
                .filter(msg => new Date(msg.created_at) < session.started_at)
                .slice(0, 5)
            console.log(`   Sample messages (first 5):`)
            beforeStartSamples.forEach(msg => {
                const timeDiff = (session.started_at - new Date(msg.created_at)) / 1000 / 60
                console.log(`     - ${msg.sender_username} (ID: ${msg.sender_user_id}) at ${msg.created_at.toISOString()} (${timeDiff.toFixed(1)} min before start)`)
            })
        }

        // ===== STAGE 4: Filter by offline flag =====
        const onlineMessages = messagesAfterStart.filter(msg => !msg.sent_when_offline)
        const offlineCount = messagesAfterStart.length - onlineMessages.length

        console.log(`\n📊 STAGE 4: Offline message filter`)
        console.log(`   Online messages: ${onlineMessages.length}`)
        console.log(`   Offline messages: ${offlineCount}`)

        // ===== FINAL: Count unique chatters =====
        const uniqueUserIds = new Set(onlineMessages.map(m => m.sender_user_id.toString()))
        console.log(`\n📊 FINAL RESULT`)
        console.log(`   Unique chatters (by user_id): ${uniqueUserIds.size}`)
        console.log(`   Total valid messages: ${onlineMessages.length}`)

        // ===== ADDITIONAL ANALYSIS =====

        // Count by username (to see if there are duplicate usernames with different IDs)
        const uniqueUsernames = new Set(onlineMessages.map(m => m.sender_username.toLowerCase()))
        console.log(`\n📊 Username analysis`)
        console.log(`   Unique usernames: ${uniqueUsernames.size}`)
        console.log(`   Unique user IDs: ${uniqueUserIds.size}`)
        console.log(`   Difference: ${uniqueUsernames.size - uniqueUserIds.size}`)

        // Find users with multiple user IDs (same username, different ID)
        const usernameToUserIds = new Map()
        onlineMessages.forEach(msg => {
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

        // Check for messages that might have been incorrectly assigned from other sessions
        // Look for messages with timestamps significantly before session start
        const suspiciousMessages = onlineMessages.filter(msg => {
            const msgTime = new Date(msg.created_at)
            const sessionStart = session.started_at
            // Check if message timestamp is more than 5 minutes before session start
            return (sessionStart - msgTime) > 5 * 60 * 1000
        })

        if (suspiciousMessages.length > 0) {
            console.log(`\n⚠️  Found ${suspiciousMessages.length} messages with timestamps >5 min before session start`)
            console.log(`   These may have been incorrectly assigned from a previous session`)
            const suspiciousSamples = suspiciousMessages.slice(0, 5)
            suspiciousSamples.forEach(msg => {
                const timeDiff = (session.started_at - new Date(msg.created_at)) / 1000 / 60
                console.log(`     - ${msg.sender_username} (ID: ${msg.sender_user_id}) at ${msg.created_at.toISOString()} (${timeDiff.toFixed(1)} min before)`)
            })
        }

        // Check for other sessions that might have overlapping messages
        const sessionStart = session.started_at
        const sessionEnd = session.ended_at || new Date()

        const overlappingSessions = await prisma.streamSession.findMany({
            where: {
                id: { not: session.id },
                channel_slug: session.channel_slug,
                OR: [
                    {
                        started_at: { lte: sessionEnd },
                        ended_at: { gte: sessionStart },
                    },
                    {
                        started_at: { lte: sessionEnd },
                        ended_at: null,
                    },
                ],
            },
            select: {
                id: true,
                started_at: true,
                ended_at: true,
            },
        })

        if (overlappingSessions.length > 0) {
            console.log(`\n⚠️  Found ${overlappingSessions.length} potentially overlapping sessions:`)
            overlappingSessions.forEach(s => {
                console.log(`   - Session ${s.id}: ${s.started_at.toISOString()} to ${s.ended_at ? s.ended_at.toISOString() : 'active'}`)
            })
        }

        // Analyze message distribution over time
        const messagesByHour = {}
        onlineMessages.forEach(msg => {
            const hour = new Date(msg.created_at).toISOString().substring(0, 13) + ':00:00'
            messagesByHour[hour] = (messagesByHour[hour] || 0) + 1
        })

        console.log(`\n📈 Message distribution over time (first 10 hours):`)
        Object.entries(messagesByHour)
            .sort(([a], [b]) => a.localeCompare(b))
            .slice(0, 10)
            .forEach(([hour, count]) => {
                console.log(`   ${hour}: ${count} messages`)
            })

        // Show message count per user (top 20)
        const userMessageCounts = new Map()
        onlineMessages.forEach(msg => {
            const userId = msg.sender_user_id.toString()
            userMessageCounts.set(userId, (userMessageCounts.get(userId) || 0) + 1)
        })

        const topChatters = Array.from(userMessageCounts.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 20)

        console.log(`\n📈 Top 20 chatters by message count:`)
        for (const [userId, count] of topChatters) {
            const user = onlineMessages.find(m => m.sender_user_id.toString() === userId)
            console.log(`   ${user?.sender_username || 'Unknown'} (ID: ${userId}): ${count} messages`)
        }

        // Summary
        console.log(`\n✅ Analysis Summary:`)
        console.log(`   Raw messages assigned: ${allAssignedMessages.length}`)
        console.log(`   After user ID filter: ${messagesWithValidUserId.length}`)
        console.log(`   After time filter: ${messagesAfterStart.length}`)
        console.log(`   After offline filter: ${onlineMessages.length}`)
        console.log(`   Final unique chatters: ${uniqueUserIds.size}`)

        if (beforeStartCount > 0 || suspiciousMessages.length > 0) {
            console.log(`\n⚠️  POTENTIAL ISSUES DETECTED:`)
            if (beforeStartCount > 0) {
                console.log(`   - ${beforeStartCount} messages have timestamps before session start`)
            }
            if (suspiciousMessages.length > 0) {
                console.log(`   - ${suspiciousMessages.length} messages appear to be from previous sessions`)
            }
        } else {
            console.log(`\n✅ No obvious data quality issues detected`)
        }

    } catch (error) {
        console.error('❌ Error:', error)
        process.exit(1)
    } finally {
        await prisma.$disconnect()
    }
}

const sessionId = process.argv[2]
analyzeSessionChatters(sessionId)
