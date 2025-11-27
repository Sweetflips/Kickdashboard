/**
 * Export all unique usernames from last 2 hours
 * Usage: node scripts/export-usernames-last-2-hours.js [session_id] [output_file]
 */

const { PrismaClient } = require('@prisma/client')
const fs = require('fs')
const prisma = new PrismaClient()

async function exportUsernames(sessionId = null, outputFile = 'usernames-last-2-hours.txt') {
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

        const now = new Date()
        const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000)

        console.log(`\n📊 Exporting usernames from last 2 hours for Session ${session.id}`)
        console.log(`   From: ${twoHoursAgo.toISOString()}`)
        console.log(`   To: ${now.toISOString()}`)

        // Get all unique users from last 2 hours
        const messagesLast2Hours = await prisma.chatMessage.findMany({
            where: {
                stream_session_id: session.id,
                sender_user_id: { gt: BigInt(0) },
                created_at: {
                    gte: twoHoursAgo,
                    lte: now,
                },
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
        messagesLast2Hours.forEach(msg => {
            const userId = msg.sender_user_id.toString()
            if (!uniqueUsers.has(userId)) {
                uniqueUsers.set(userId, msg.sender_username)
            }
        })

        const usernames = Array.from(uniqueUsers.values()).sort()

        console.log(`\n✅ Found ${usernames.length} unique chatters`)

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

    } catch (error) {
        console.error('❌ Error:', error)
        process.exit(1)
    } finally {
        await prisma.$disconnect()
    }
}

const sessionId = process.argv[2] || null
const outputFile = process.argv[3] || 'usernames-last-2-hours.txt'
exportUsernames(sessionId, outputFile)







