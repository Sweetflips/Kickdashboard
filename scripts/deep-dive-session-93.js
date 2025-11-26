/**
 * Deep dive analysis for Session 93 to find why unique chatters count seems high
 * Usage: node scripts/deep-dive-session-93.js
 */

const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function deepDiveSession93() {
    try {
        const sessionId = BigInt(93)

        // Get session info
        const session = await prisma.streamSession.findUnique({
            where: { id: sessionId },
        })

        if (!session) {
            console.error('❌ Session 93 not found')
            process.exit(1)
        }

        console.log(`\n🔍 Deep Dive Analysis for Session 93`)
        console.log(`   Started: ${session.started_at.toISOString()}`)
        console.log(`   Ended: ${session.ended_at ? session.ended_at.toISOString() : 'Still active'}`)
        console.log(`   Duration: ${session.ended_at ? ((session.ended_at - session.started_at) / 1000 / 60).toFixed(1) : 'N/A'} minutes`)

        // Get all messages for this session
        const allMessages = await prisma.chatMessage.findMany({
            where: {
                stream_session_id: sessionId,
                sender_user_id: { gt: BigInt(0) },
                created_at: { gte: session.started_at },
                sent_when_offline: false,
            },
            select: {
                message_id: true,
                sender_user_id: true,
                sender_username: true,
                created_at: true,
                timestamp: true,
            },
            orderBy: {
                created_at: 'asc',
            },
        })

        console.log(`\n📊 Total valid messages: ${allMessages.length}`)

        // Check for duplicate message_ids (shouldn't happen but check)
        const messageIds = allMessages.map(m => m.message_id)
        const uniqueMessageIds = new Set(messageIds)
        if (messageIds.length !== uniqueMessageIds.size) {
            console.log(`\n⚠️  Found ${messageIds.length - uniqueMessageIds.size} duplicate message_ids!`)
        }

        // Count unique chatters
        const uniqueUserIds = new Set(allMessages.map(m => m.sender_user_id.toString()))
        console.log(`\n👥 Unique chatters: ${uniqueUserIds.size}`)

        // Check if messages might belong to other sessions
        // Look for messages with timestamps that don't align with session time
        const sessionStart = session.started_at
        const sessionEnd = session.ended_at || new Date()

        // Check for messages that might have been from a previous session
        // by looking at the timestamp field (which is the Kick API timestamp)
        const suspiciousMessages = []

        allMessages.forEach(msg => {
            // Convert BigInt timestamp to Date
            const kickTimestamp = Number(msg.timestamp)
            const kickDate = new Date(kickTimestamp)
            const dbDate = new Date(msg.created_at)

            // Check if Kick timestamp is significantly different from DB created_at
            const timeDiff = Math.abs(kickDate - dbDate) / 1000 / 60 // minutes

            // Check if Kick timestamp is before session start
            if (kickDate < sessionStart) {
                suspiciousMessages.push({
                    ...msg,
                    kickTimestamp: kickDate,
                    dbTimestamp: dbDate,
                    timeDiffMinutes: timeDiff,
                    reason: 'kick_timestamp_before_session'
                })
            }
        })

        if (suspiciousMessages.length > 0) {
            console.log(`\n⚠️  Found ${suspiciousMessages.length} messages with Kick timestamps before session start:`)
            suspiciousMessages.slice(0, 10).forEach(msg => {
                console.log(`   - ${msg.sender_username} (ID: ${msg.sender_user_id})`)
                console.log(`     Kick timestamp: ${msg.kickTimestamp.toISOString()}`)
                console.log(`     DB timestamp: ${msg.dbTimestamp.toISOString()}`)
                console.log(`     Time diff: ${msg.timeDiffMinutes.toFixed(1)} min`)
            })
        }

        // Check for messages that might belong to other sessions
        // Get all other sessions for this channel
        const otherSessions = await prisma.streamSession.findMany({
            where: {
                id: { not: sessionId },
                channel_slug: session.channel_slug,
            },
            select: {
                id: true,
                started_at: true,
                ended_at: true,
            },
            orderBy: {
                started_at: 'desc',
            },
        })

        console.log(`\n📊 Checking for messages that might belong to other sessions:`)

        // For each message, check if its timestamp falls within another session's window
        const messagesInOtherSessions = []

        for (const otherSession of otherSessions.slice(0, 10)) { // Check last 10 sessions
            const otherStart = otherSession.started_at
            const otherEnd = otherSession.ended_at || new Date()

            const messagesInThisOtherSession = allMessages.filter(msg => {
                const kickTimestamp = Number(msg.timestamp)
                const kickDate = new Date(kickTimestamp)
                return kickDate >= otherStart && kickDate <= otherEnd
            })

            if (messagesInThisOtherSession.length > 0) {
                const uniqueUsersInOther = new Set(
                    messagesInThisOtherSession.map(m => m.sender_user_id.toString())
                )
                console.log(`   Session ${otherSession.id} (${otherStart.toISOString()} to ${otherEnd.toISOString()}):`)
                console.log(`     - ${messagesInThisOtherSession.length} messages (${uniqueUsersInOther.size} unique users)`)
                messagesInOtherSessions.push({
                    sessionId: otherSession.id,
                    count: messagesInThisOtherSession.length,
                    uniqueUsers: uniqueUsersInOther.size,
                })
            }
        }

        // Analyze user activity patterns
        // Check if there are users who only sent 1 message (potential bots or lurkers)
        const userMessageCounts = new Map()
        allMessages.forEach(msg => {
            const userId = msg.sender_user_id.toString()
            userMessageCounts.set(userId, (userMessageCounts.get(userId) || 0) + 1)
        })

        const singleMessageUsers = Array.from(userMessageCounts.entries())
            .filter(([userId, count]) => count === 1)
            .map(([userId]) => userId)

        console.log(`\n📊 User activity analysis:`)
        console.log(`   Total unique users: ${uniqueUserIds.size}`)
        console.log(`   Users with 1 message: ${singleMessageUsers.length} (${(singleMessageUsers.length / uniqueUserIds.size * 100).toFixed(1)}%)`)
        console.log(`   Users with 2-5 messages: ${Array.from(userMessageCounts.values()).filter(c => c >= 2 && c <= 5).length}`)
        console.log(`   Users with 6-10 messages: ${Array.from(userMessageCounts.values()).filter(c => c >= 6 && c <= 10).length}`)
        console.log(`   Users with 11+ messages: ${Array.from(userMessageCounts.values()).filter(c => c >= 11).length}`)

        // Check for users with same username but different IDs
        const usernameToUserIds = new Map()
        allMessages.forEach(msg => {
            const usernameLower = msg.sender_username.toLowerCase()
            if (!usernameToUserIds.has(usernameLower)) {
                usernameToUserIds.set(usernameLower, new Set())
            }
            usernameToUserIds.get(usernameLower).add(msg.sender_user_id.toString())
        })

        const duplicateUsernames = Array.from(usernameToUserIds.entries())
            .filter(([username, userIds]) => userIds.size > 1)

        if (duplicateUsernames.length > 0) {
            console.log(`\n⚠️  Found ${duplicateUsernames.length} usernames with multiple user IDs:`)
            duplicateUsernames.forEach(([username, userIds]) => {
                const userIdsArray = Array.from(userIds)
                const messageCounts = userIdsArray.map(uid => {
                    const userMessages = allMessages.filter(m => m.sender_user_id.toString() === uid)
                    return { userId: uid, count: userMessages.length }
                })
                console.log(`   - ${username}: ${userIdsArray.join(', ')}`)
                messageCounts.forEach(({ userId, count }) => {
                    console.log(`     User ID ${userId}: ${count} messages`)
                })
            })
        }

        // Check message distribution by time windows
        const messagesBy30Min = {}
        allMessages.forEach(msg => {
            const msgTime = new Date(msg.created_at)
            const windowStart = new Date(Math.floor(msgTime / (30 * 60 * 1000)) * (30 * 60 * 1000))
            const windowKey = windowStart.toISOString()
            if (!messagesBy30Min[windowKey]) {
                messagesBy30Min[windowKey] = { messages: 0, uniqueUsers: new Set() }
            }
            messagesBy30Min[windowKey].messages++
            messagesBy30Min[windowKey].uniqueUsers.add(msg.sender_user_id.toString())
        })

        console.log(`\n📊 Message distribution by 30-minute windows:`)
        Object.entries(messagesBy30Min)
            .sort(([a], [b]) => a.localeCompare(b))
            .forEach(([window, data]) => {
                console.log(`   ${window}: ${data.messages} messages, ${data.uniqueUsers.size} unique users`)
            })

        // Summary
        console.log(`\n✅ Summary:`)
        console.log(`   Total unique chatters: ${uniqueUserIds.size}`)
        console.log(`   Total messages: ${allMessages.length}`)
        console.log(`   Average messages per user: ${(allMessages.length / uniqueUserIds.size).toFixed(1)}`)
        console.log(`   Single-message users: ${singleMessageUsers.length}`)

        if (suspiciousMessages.length > 0) {
            console.log(`\n⚠️  Potential issues:`)
            console.log(`   - ${suspiciousMessages.length} messages have Kick timestamps before session start`)
        }

        if (messagesInOtherSessions.length > 0) {
            console.log(`   - Some messages may belong to other sessions based on timestamp analysis`)
        }

    } catch (error) {
        console.error('❌ Error:', error)
        process.exit(1)
    } finally {
        await prisma.$disconnect()
    }
}

deepDiveSession93()






