/**
 * Check for duplicate users (same username, different IDs) in Session 93
 * Usage: node scripts/check-duplicate-users.js
 */

const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function checkDuplicateUsers() {
    try {
        const sessionId = BigInt(93)

        const session = await prisma.streamSession.findUnique({
            where: { id: sessionId },
        })

        // Get all messages
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
            },
        })

        // Group by username (case-insensitive)
        const usernameToUserIds = new Map()
        allMessages.forEach(msg => {
            const usernameLower = msg.sender_username.toLowerCase()
            if (!usernameToUserIds.has(usernameLower)) {
                usernameToUserIds.set(usernameLower, new Map())
            }
            const userIdMap = usernameToUserIds.get(usernameLower)
            const userIdStr = msg.sender_user_id.toString()
            if (!userIdMap.has(userIdStr)) {
                userIdMap.set(userIdStr, {
                    userId: userIdStr,
                    username: msg.sender_username,
                    messageCount: 0,
                    firstMessage: msg.created_at,
                    lastMessage: msg.created_at,
                })
            }
            const userData = userIdMap.get(userIdStr)
            userData.messageCount++
            if (msg.created_at < userData.firstMessage) {
                userData.firstMessage = msg.created_at
            }
            if (msg.created_at > userData.lastMessage) {
                userData.lastMessage = msg.created_at
            }
        })

        // Find usernames with multiple user IDs
        const duplicateUsernames = Array.from(usernameToUserIds.entries())
            .filter(([username, userIdMap]) => userIdMap.size > 1)
            .sort((a, b) => b[1].size - a[1].size)

        console.log(`\n📊 Duplicate Username Analysis:`)
        console.log(`   Total unique usernames: ${usernameToUserIds.size}`)
        console.log(`   Usernames with multiple user IDs: ${duplicateUsernames.length}`)

        if (duplicateUsernames.length > 0) {
            console.log(`\n⚠️  Usernames with multiple user IDs:`)
            duplicateUsernames.forEach(([username, userIdMap]) => {
                console.log(`\n   ${username}:`)
                const userIds = Array.from(userIdMap.values())
                userIds.forEach(userData => {
                    const duration = (userData.lastMessage - userData.firstMessage) / 1000 / 60
                    console.log(`     - User ID ${userData.userId}: ${userData.messageCount} messages`)
                    console.log(`       First: ${userData.firstMessage.toISOString()}`)
                    console.log(`       Last: ${userData.lastMessage.toISOString()}`)
                    console.log(`       Duration: ${duration.toFixed(1)} minutes`)
                })
            })

            // Calculate impact on unique chatters count
            const totalDuplicateUserIds = duplicateUsernames.reduce((sum, [username, userIdMap]) => {
                return sum + (userIdMap.size - 1) // -1 because one is the "real" user
            }, 0)

            console.log(`\n📊 Impact on unique chatters count:`)
            console.log(`   Total duplicate user IDs: ${totalDuplicateUserIds}`)
            console.log(`   If we deduplicate by username, unique chatters would be: ${usernameToUserIds.size}`)
            console.log(`   Current count (by user_id): ${new Set(allMessages.map(m => m.sender_user_id.toString())).size}`)
        }

        // Check for users who might be bots (very high message count)
        const userMessageCounts = new Map()
        allMessages.forEach(msg => {
            const userId = msg.sender_user_id.toString()
            userMessageCounts.set(userId, (userMessageCounts.get(userId) || 0) + 1)
        })

        const highMessageUsers = Array.from(userMessageCounts.entries())
            .filter(([userId, count]) => count > 100)
            .sort((a, b) => b[1] - a[1])

        console.log(`\n📊 High-activity users (>100 messages):`)
        highMessageUsers.forEach(([userId, count]) => {
            const user = allMessages.find(m => m.sender_user_id.toString() === userId)
            console.log(`   ${user?.sender_username || 'Unknown'} (ID: ${userId}): ${count} messages`)
        })

        // Check for users with suspicious patterns (e.g., all messages in a very short time)
        const userActivityWindows = new Map()
        allMessages.forEach(msg => {
            const userId = msg.sender_user_id.toString()
            if (!userActivityWindows.has(userId)) {
                userActivityWindows.set(userId, {
                    first: msg.created_at,
                    last: msg.created_at,
                    count: 0,
                })
            }
            const activity = userActivityWindows.get(userId)
            activity.count++
            if (msg.created_at < activity.first) {
                activity.first = msg.created_at
            }
            if (msg.created_at > activity.last) {
                activity.last = msg.created_at
            }
        })

        const suspiciousUsers = Array.from(userActivityWindows.entries())
            .filter(([userId, activity]) => {
                const duration = (activity.last - activity.first) / 1000 / 60 // minutes
                // User with many messages in a very short time (potential bot)
                return activity.count > 50 && duration < 5
            })
            .sort((a, b) => b[1].count - a[1].count)

        if (suspiciousUsers.length > 0) {
            console.log(`\n⚠️  Users with suspicious activity patterns (>50 messages in <5 minutes):`)
            suspiciousUsers.slice(0, 10).forEach(([userId, activity]) => {
                const user = allMessages.find(m => m.sender_user_id.toString() === userId)
                const duration = (activity.last - activity.first) / 1000 / 60
                console.log(`   ${user?.sender_username || 'Unknown'} (ID: ${userId}): ${activity.count} messages in ${duration.toFixed(1)} minutes`)
            })
        }

    } catch (error) {
        console.error('❌ Error:', error)
        process.exit(1)
    } finally {
        await prisma.$disconnect()
    }
}

checkDuplicateUsers()







