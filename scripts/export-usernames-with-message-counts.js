/**
 * Export usernames with message counts from full session
 * Usage: node scripts/export-usernames-with-message-counts.js [session_id] [output_file]
 */

const { PrismaClient } = require('@prisma/client')
const fs = require('fs')
const prisma = new PrismaClient()

async function exportUsernamesWithCounts(sessionId = null, outputFile = 'usernames-with-counts.txt') {
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

        console.log(`\n📊 Exporting usernames with message counts from Session ${session.id}`)
        console.log(`   Session started: ${session.started_at.toISOString()}`)

        // Get all messages and count per user
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

        // Convert to array and sort by message count (descending)
        const usersWithCounts = Array.from(userMessageCounts.entries())
            .map(([userId, data]) => ({
                user_id: userId,
                username: data.username,
                message_count: data.count,
            }))
            .sort((a, b) => b.message_count - a.message_count)

        console.log(`\n✅ Found ${usersWithCounts.length} unique chatters`)

        // Create text file: username - message_count
        const textContent = usersWithCounts
            .map(u => `${u.username} - ${u.message_count}`)
            .join('\n')

        fs.writeFileSync(outputFile, textContent, 'utf8')
        console.log(`\n✅ Exported to: ${outputFile}`)

        // Create CSV file
        const csvFile = outputFile.replace('.txt', '.csv')
        const csvContent = [
            'username,user_id,message_count',
            ...usersWithCounts.map(u => `"${u.username}",${u.user_id},${u.message_count}`)
        ].join('\n')

        fs.writeFileSync(csvFile, csvContent, 'utf8')
        console.log(`✅ Exported CSV to: ${csvFile}`)

        // Create JSON file
        const jsonFile = outputFile.replace('.txt', '.json')
        fs.writeFileSync(jsonFile, JSON.stringify(usersWithCounts, null, 2), 'utf8')
        console.log(`✅ Exported JSON to: ${jsonFile}`)

        // Show stats
        const totalMessages = usersWithCounts.reduce((sum, u) => sum + u.message_count, 0)
        const avgMessages = (totalMessages / usersWithCounts.length).toFixed(1)

        console.log(`\n📊 Stats:`)
        console.log(`   Total messages: ${totalMessages}`)
        console.log(`   Unique chatters: ${usersWithCounts.length}`)
        console.log(`   Average messages per user: ${avgMessages}`)
        console.log(`\n📋 Top 10 chatters:`)
        usersWithCounts.slice(0, 10).forEach((user, idx) => {
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
const outputFile = process.argv[3] || 'usernames-with-counts.txt'
exportUsernamesWithCounts(sessionId, outputFile)







