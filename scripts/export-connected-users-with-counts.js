/**
 * Export actually connected users with message counts
 * Usage: node scripts/export-connected-users-with-counts.js [session_id]
 */

const { PrismaClient } = require('@prisma/client')
const fs = require('fs')
const prisma = new PrismaClient()

async function exportConnectedUsersWithCounts(sessionId = null) {
    try {
        let session

        if (sessionId) {
            session = await prisma.streamSession.findUnique({
                where: { id: BigInt(sessionId) },
            })
        } else {
            session = await prisma.streamSession.findFirst({
                where: { ended_at: null },
                orderBy: { started_at: 'desc' },
            })
        }

        if (!session) {
            console.error('❌ Session not found')
            process.exit(1)
        }

        console.log(`\n📊 Exporting connected users with message counts from Session ${session.id}`)

        // Get all messages
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
        })

        // Count messages per user
        const userMessageCounts = new Map()
        messages.forEach(msg => {
            const userId = msg.sender_user_id.toString()
            if (!userMessageCounts.has(userId)) {
                userMessageCounts.set(userId, {
                    username: msg.sender_username,
                    count: 0,
                })
            }
            userMessageCounts.get(userId).count++
        })

        // Get users who actually connected (have access_token_hash)
        const connectedUsers = await prisma.user.findMany({
            where: {
                kick_user_id: { in: Array.from(userMessageCounts.keys()).map(id => BigInt(id)) },
                access_token_hash: { not: null },
            },
            select: {
                kick_user_id: true,
                username: true,
            },
        })

        // Create list with message counts
        const connectedWithCounts = connectedUsers
            .map(user => {
                const userId = user.kick_user_id.toString()
                const messageData = userMessageCounts.get(userId)
                return {
                    user_id: userId,
                    username: user.username,
                    message_count: messageData ? messageData.count : 0,
                }
            })
            .filter(u => u.message_count > 0)
            .sort((a, b) => b.message_count - a.message_count)

        console.log(`\n✅ Found ${connectedWithCounts.length} connected users`)

        // Create text file
        const textContent = connectedWithCounts
            .map(u => `${u.username} - ${u.message_count}`)
            .join('\n')

        fs.writeFileSync('connected-users-with-counts.txt', textContent, 'utf8')
        console.log(`✅ Exported to: connected-users-with-counts.txt`)

        // Create CSV file
        const csvContent = [
            'username,user_id,message_count',
            ...connectedWithCounts.map(u => `"${u.username}",${u.user_id},${u.message_count}`)
        ].join('\n')

        fs.writeFileSync('connected-users-with-counts.csv', csvContent, 'utf8')
        console.log(`✅ Exported CSV to: connected-users-with-counts.csv`)

        // Create JSON file
        fs.writeFileSync('connected-users-with-counts.json', JSON.stringify(connectedWithCounts, null, 2), 'utf8')
        console.log(`✅ Exported JSON to: connected-users-with-counts.json`)

        // Show top users
        console.log(`\n📋 Top 10 connected users:`)
        connectedWithCounts.slice(0, 10).forEach((user, idx) => {
            console.log(`   ${idx + 1}. ${user.username}: ${user.message_count} messages`)
        })

    } catch (error) {
        console.error('❌ Error:', error)
        process.exit(1)
    } finally {
        await prisma.$disconnect()
    }
}

const sessionId = process.argv[2] || null
exportConnectedUsersWithCounts(sessionId)









