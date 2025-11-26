/**
 * Check how many chatters have Kick connected
 * Usage: node scripts/check-kick-connected.js [session_id]
 */

const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function checkKickConnected(sessionId = null) {
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

        console.log(`\n📊 Checking Kick connection status for Session ${session.id}`)
        console.log(`   Session started: ${session.started_at.toISOString()}`)

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

        // Check which users exist in the users table and have kick_connected = true
        const users = await prisma.user.findMany({
            where: {
                kick_user_id: { in: uniqueUserIds },
            },
            select: {
                kick_user_id: true,
                username: true,
                kick_connected: true,
            },
        })

        // Create a map for quick lookup
        const userMap = new Map()
        users.forEach(user => {
            userMap.set(user.kick_user_id.toString(), {
                username: user.username,
                kick_connected: user.kick_connected,
            })
        })

        // Count connected vs not connected
        let connectedCount = 0
        let notConnectedCount = 0
        let notInDatabaseCount = 0

        const connectedUsers = []
        const notConnectedUsers = []
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
            } else if (userInfo.kick_connected) {
                connectedCount++
                connectedUsers.push({
                    kick_user_id: userId,
                    username: userInfo.username,
                    chat_username: msg.sender_username,
                })
            } else {
                notConnectedCount++
                notConnectedUsers.push({
                    kick_user_id: userId,
                    username: userInfo.username,
                    chat_username: msg.sender_username,
                })
            }
        })

        console.log(`\n📊 Kick Connection Status:`)
        console.log(`   ✅ Connected: ${connectedCount} (${(connectedCount / uniqueUserIds.length * 100).toFixed(1)}%)`)
        console.log(`   ❌ Not Connected: ${notConnectedCount} (${(notConnectedCount / uniqueUserIds.length * 100).toFixed(1)}%)`)
        console.log(`   ⚠️  Not in Database: ${notInDatabaseCount} (${(notInDatabaseCount / uniqueUserIds.length * 100).toFixed(1)}%)`)
        console.log(`   📊 Total: ${uniqueUserIds.length}`)

        // Show some examples
        if (connectedUsers.length > 0) {
            console.log(`\n✅ Sample connected users (first 10):`)
            connectedUsers.slice(0, 10).forEach((user, idx) => {
                console.log(`   ${idx + 1}. ${user.username} (Kick ID: ${user.kick_user_id})`)
            })
        }

        if (notConnectedUsers.length > 0) {
            console.log(`\n❌ Sample not connected users (first 10):`)
            notConnectedUsers.slice(0, 10).forEach((user, idx) => {
                console.log(`   ${idx + 1}. ${user.username} (Kick ID: ${user.kick_user_id})`)
            })
        }

        if (notInDatabaseUsers.length > 0) {
            console.log(`\n⚠️  Sample users not in database (first 10):`)
            notInDatabaseUsers.slice(0, 10).forEach((user, idx) => {
                console.log(`   ${idx + 1}. ${user.username} (Kick ID: ${user.kick_user_id})`)
            })
        }

        // Export lists if requested
        const fs = require('fs')
        if (connectedUsers.length > 0) {
            const connectedList = connectedUsers.map(u => u.username).sort().join('\n')
            fs.writeFileSync('kick-connected-users.txt', connectedList, 'utf8')
            console.log(`\n✅ Exported ${connectedUsers.length} connected usernames to: kick-connected-users.txt`)
        }

        if (notConnectedUsers.length > 0) {
            const notConnectedList = notConnectedUsers.map(u => u.username).sort().join('\n')
            fs.writeFileSync('kick-not-connected-users.txt', notConnectedList, 'utf8')
            console.log(`✅ Exported ${notConnectedUsers.length} not connected usernames to: kick-not-connected-users.txt`)
        }

    } catch (error) {
        console.error('❌ Error:', error)
        process.exit(1)
    } finally {
        await prisma.$disconnect()
    }
}

const sessionId = process.argv[2] || null
checkKickConnected(sessionId)






