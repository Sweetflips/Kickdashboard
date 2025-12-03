/**
 * Export all unique usernames from full session
 * Usage: node scripts/export-usernames-full-session.js [session_id] [output_file]
 */

const { PrismaClient } = require('@prisma/client')
const fs = require('fs')
const prisma = new PrismaClient()

async function exportUsernames(sessionId = null, outputFile = 'usernames-full-session.txt') {
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

        console.log(`\n📊 Exporting usernames from FULL session ${session.id}`)
        console.log(`   Session started: ${session.started_at.toISOString()}`)
        console.log(`   Session ended: ${session.ended_at ? session.ended_at.toISOString() : 'Still active'}`)

        // Get all unique users from full session
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
            orderBy: {
                sender_username: 'asc',
            },
        })

        // Get unique usernames (in case there are duplicates)
        const uniqueUsers = new Map()
        messages.forEach(msg => {
            const userId = msg.sender_user_id.toString()
            if (!uniqueUsers.has(userId)) {
                uniqueUsers.set(userId, msg.sender_username)
            }
        })

        const usernames = Array.from(uniqueUsers.values()).sort()

        console.log(`\n✅ Found ${usernames.length} unique chatters in full session`)

        // Write to file
        const content = usernames.join('\n')
        fs.writeFileSync(outputFile, content, 'utf8')

        console.log(`\n✅ Exported ${usernames.length} usernames to: ${outputFile}`)
        console.log(`\n📋 First 10 usernames:`)
        usernames.slice(0, 10).forEach((username, idx) => {
            console.log(`   ${idx + 1}. ${username}`)
        })
        console.log(`   ... and ${usernames.length - 10} more`)

        // Also create a JSON file with more details
        const jsonFile = outputFile.replace('.txt', '.json')
        const userDetails = Array.from(uniqueUsers.entries()).map(([userId, username]) => ({
            user_id: userId,
            username: username,
        })).sort((a, b) => a.username.localeCompare(b.username))

        fs.writeFileSync(jsonFile, JSON.stringify(userDetails, null, 2), 'utf8')
        console.log(`\n✅ Also exported detailed JSON to: ${jsonFile}`)

        // Show some stats
        const totalMessages = await prisma.chatMessage.count({
            where: {
                stream_session_id: session.id,
                sender_user_id: { gt: BigInt(0) },
                created_at: { gte: session.started_at },
                sent_when_offline: false,
            },
        })

        console.log(`\n📊 Session Stats:`)
        console.log(`   Total messages: ${totalMessages}`)
        console.log(`   Unique chatters: ${usernames.length}`)
        console.log(`   Average messages per user: ${(totalMessages / usernames.length).toFixed(1)}`)

    } catch (error) {
        console.error('❌ Error:', error)
        process.exit(1)
    } finally {
        await prisma.$disconnect()
    }
}

const sessionId = process.argv[2] || null
const outputFile = process.argv[3] || 'usernames-full-session.txt'
exportUsernames(sessionId, outputFile)










