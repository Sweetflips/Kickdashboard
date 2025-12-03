/**
 * Check how many chatters have actually connected their Kick account (logged in via OAuth)
 * Usage: node scripts/check-actual-kick-connected.js [session_id]
 */

const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function checkActualKickConnected(sessionId = null) {
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

        console.log(`\n📊 Checking ACTUAL Kick connection status for Session ${session.id}`)
        console.log(`   Session started: ${session.started_at.toISOString()}`)
        console.log(`\n   Note: Users are auto-created when they chat, so we check for:`)
        console.log(`   - access_token_hash (OAuth login)`)
        console.log(`   - last_login_at (has logged in)`)

        // Get all unique user IDs from session messages
        const messages = await prisma.chatMessage.findMany({
            where: {
                stream_session_id: session.id,
                sender_user_id: { gt: BigInt(0) },
                created_at: { gte: session.started_at },
                sent_when_offline: false,
            },
            select: {
                sender_user_id: true,
                sender_username: true,
            },
            distinct: ['sender_user_id'],
        })

        const uniqueUserIds = messages.map(m => m.sender_user_id)
        console.log(`\n📊 Found ${uniqueUserIds.length} unique chatters`)

        // Check which users exist in the users table and have actually logged in
        const users = await prisma.user.findMany({
            where: {
                kick_user_id: { in: uniqueUserIds },
            },
            select: {
                kick_user_id: true,
                username: true,
                access_token_hash: true,
                last_login_at: true,
                kick_connected: true,
                created_at: true,
            },
        })

        // Create a map for quick lookup
        const userMap = new Map()
        users.forEach(user => {
            userMap.set(user.kick_user_id.toString(), {
                username: user.username,
                has_access_token: !!user.access_token_hash,
                has_last_login: !!user.last_login_at,
                kick_connected: user.kick_connected,
                created_at: user.created_at,
            })
        })

        // Count different categories
        let actuallyConnectedCount = 0  // Has access_token_hash (OAuth login)
        let hasLoggedInCount = 0       // Has last_login_at
        let autoCreatedCount = 0        // No access_token, no last_login (just chatted)
        let notInDatabaseCount = 0

        const actuallyConnectedUsers = []
        const hasLoggedInUsers = []
        const autoCreatedUsers = []
        const notInDatabaseUsers = []

        messages.forEach(msg => {
            const userId = msg.sender_user_id.toString()
            const userInfo = userMap.get(userId)

            if (!userInfo) {
                notInDatabaseCount++
                notInDatabaseUsers.push({
                    kick_user_id: userId,
                    username: msg.sender_username,
                })
            } else if (userInfo.has_access_token) {
                // Actually connected via OAuth
                actuallyConnectedCount++
                actuallyConnectedUsers.push({
                    kick_user_id: userId,
                    username: userInfo.username,
                    chat_username: msg.sender_username,
                    last_login: userInfo.has_last_login ? 'Yes' : 'No',
                })
            } else if (userInfo.has_last_login) {
                // Has logged in but no access token (maybe expired?)
                hasLoggedInCount++
                hasLoggedInUsers.push({
                    kick_user_id: userId,
                    username: userInfo.username,
                    chat_username: msg.sender_username,
                })
            } else {
                // Auto-created when they chatted, never logged in
                autoCreatedCount++
                autoCreatedUsers.push({
                    kick_user_id: userId,
                    username: userInfo.username,
                    chat_username: msg.sender_username,
                    created_at: userInfo.created_at,
                })
            }
        })

        console.log(`\n📊 ACTUAL Connection Status:`)
        console.log(`   ✅ Actually Connected (OAuth login): ${actuallyConnectedCount} (${(actuallyConnectedCount / uniqueUserIds.length * 100).toFixed(1)}%)`)
        console.log(`   🔐 Has Logged In (no token): ${hasLoggedInCount} (${(hasLoggedInCount / uniqueUserIds.length * 100).toFixed(1)}%)`)
        console.log(`   💬 Auto-Created (just chatted): ${autoCreatedCount} (${(autoCreatedCount / uniqueUserIds.length * 100).toFixed(1)}%)`)
        console.log(`   ⚠️  Not in Database: ${notInDatabaseCount} (${(notInDatabaseCount / uniqueUserIds.length * 100).toFixed(1)}%)`)
        console.log(`   📊 Total: ${uniqueUserIds.length}`)

        // Show some examples
        if (actuallyConnectedUsers.length > 0) {
            console.log(`\n✅ Sample actually connected users (first 10):`)
            actuallyConnectedUsers.slice(0, 10).forEach((user, idx) => {
                console.log(`   ${idx + 1}. ${user.username} (Kick ID: ${user.kick_user_id})`)
            })
        }

        if (autoCreatedUsers.length > 0) {
            console.log(`\n💬 Sample auto-created users (first 10):`)
            autoCreatedUsers.slice(0, 10).forEach((user, idx) => {
                console.log(`   ${idx + 1}. ${user.username} (Kick ID: ${user.kick_user_id})`)
            })
        }

        // Export lists
        const fs = require('fs')
        if (actuallyConnectedUsers.length > 0) {
            const connectedList = actuallyConnectedUsers.map(u => u.username).sort().join('\n')
            fs.writeFileSync('actually-connected-users.txt', connectedList, 'utf8')
            console.log(`\n✅ Exported ${actuallyConnectedUsers.length} actually connected usernames to: actually-connected-users.txt`)
        }

        if (autoCreatedUsers.length > 0) {
            const autoCreatedList = autoCreatedUsers.map(u => u.username).sort().join('\n')
            fs.writeFileSync('auto-created-users.txt', autoCreatedList, 'utf8')
            console.log(`✅ Exported ${autoCreatedUsers.length} auto-created usernames to: auto-created-users.txt`)
        }

        console.log(`\n💡 Note: "kick_connected" defaults to true in schema, so it's not a reliable indicator.`)
        console.log(`   We check for access_token_hash (OAuth login) instead.`)

    } catch (error) {
        console.error('❌ Error:', error)
        process.exit(1)
    } finally {
        await prisma.$disconnect()
    }
}

const sessionId = process.argv[2] || null
checkActualKickConnected(sessionId)









