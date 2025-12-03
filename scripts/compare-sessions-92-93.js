/**
 * Compare Sessions 92 and 93 to understand the relationship
 * Usage: node scripts/compare-sessions-92-93.js
 */

const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function compareSessions() {
    try {
        const session92 = await prisma.streamSession.findUnique({
            where: { id: BigInt(92) },
        })

        const session93 = await prisma.streamSession.findUnique({
            where: { id: BigInt(93) },
        })

        console.log(`\n📊 Session Comparison:`)
        console.log(`\nSession 92:`)
        console.log(`   ID: ${session92.id}`)
        console.log(`   Started: ${session92.started_at.toISOString()}`)
        console.log(`   Ended: ${session92.ended_at ? session92.ended_at.toISOString() : 'Still active'}`)
        console.log(`   Title: ${session92.session_title || 'Untitled'}`)

        console.log(`\nSession 93:`)
        console.log(`   ID: ${session93.id}`)
        console.log(`   Started: ${session93.started_at.toISOString()}`)
        console.log(`   Ended: ${session93.ended_at ? session93.ended_at.toISOString() : 'Still active'}`)
        console.log(`   Title: ${session93.session_title || 'Untitled'}`)

        const timeDiff = session93.started_at - session92.started_at
        console.log(`\n⏱️  Time difference: ${timeDiff}ms (${(timeDiff / 1000).toFixed(3)} seconds)`)

        // Get messages for Session 93
        const session93Messages = await prisma.chatMessage.findMany({
            where: {
                stream_session_id: BigInt(93),
                sender_user_id: { gt: BigInt(0) },
                created_at: { gte: session93.started_at },
                sent_when_offline: false,
            },
            select: {
                message_id: true,
                sender_user_id: true,
                sender_username: true,
                created_at: true,
                timestamp: true,
            },
        })

        // Check how many Session 93 messages have Kick timestamps in Session 92's window
        const session92Start = session92.started_at
        const session92End = session92.ended_at || new Date()

        const messagesIn92Window = session93Messages.filter(msg => {
            const kickTimestamp = Number(msg.timestamp)
            const kickDate = new Date(kickTimestamp)
            return kickDate >= session92Start && kickDate <= session92End
        })

        console.log(`\n📊 Message Analysis:`)
        console.log(`   Session 93 total messages: ${session93Messages.length}`)
        console.log(`   Messages with Kick timestamps in Session 92 window: ${messagesIn92Window.length}`)
        console.log(`   Percentage: ${(messagesIn92Window.length / session93Messages.length * 100).toFixed(1)}%`)

        // Check if Session 92 has any messages at all
        const session92Messages = await prisma.chatMessage.findMany({
            where: {
                stream_session_id: BigInt(92),
            },
            select: {
                message_id: true,
            },
        })

        console.log(`   Session 92 total messages: ${session92Messages.length}`)

        // Check for messages that might have been created before Session 93 started
        // but assigned to Session 93
        const messagesBefore93Start = session93Messages.filter(msg => {
            const kickTimestamp = Number(msg.timestamp)
            const kickDate = new Date(kickTimestamp)
            return kickDate < session93.started_at
        })

        console.log(`\n⚠️  Messages in Session 93 with Kick timestamps BEFORE Session 93 started:`)
        console.log(`   Count: ${messagesBefore93Start.length}`)

        if (messagesBefore93Start.length > 0) {
            const uniqueUsersBefore = new Set(
                messagesBefore93Start.map(m => m.sender_user_id.toString())
            )
            console.log(`   Unique users: ${uniqueUsersBefore.size}`)
            console.log(`   Sample messages (first 5):`)
            messagesBefore93Start.slice(0, 5).forEach(msg => {
                const kickTimestamp = Number(msg.timestamp)
                const kickDate = new Date(kickTimestamp)
                const timeBefore = (session93.started_at - kickDate) / 1000
                console.log(`     - ${msg.sender_username} (ID: ${msg.sender_user_id})`)
                console.log(`       Kick timestamp: ${kickDate.toISOString()}`)
                console.log(`       Session 93 started: ${session93.started_at.toISOString()}`)
                console.log(`       Time before: ${timeBefore.toFixed(1)} seconds`)
            })
        }

        // Check if there are messages that should have been assigned to Session 92
        // but were assigned to Session 93 instead
        const messagesThatShouldBeIn92 = session93Messages.filter(msg => {
            const kickTimestamp = Number(msg.timestamp)
            const kickDate = new Date(kickTimestamp)
            // Message should be in Session 92 if its Kick timestamp is in Session 92's window
            // AND Session 92 was active at that time
            return kickDate >= session92Start && kickDate <= session92End && kickDate < session93.started_at
        })

        console.log(`\n⚠️  Messages that might have been incorrectly assigned:`)
        console.log(`   Messages in Session 93 with Kick timestamps in Session 92's window (before Session 93 started): ${messagesThatShouldBeIn92.length}`)

        if (messagesThatShouldBeIn92.length > 0) {
            const uniqueUsersIncorrect = new Set(
                messagesThatShouldBeIn92.map(m => m.sender_user_id.toString())
            )
            console.log(`   Unique users affected: ${uniqueUsersIncorrect.size}`)
        }

        // Check message assignment logic
        // Messages are assigned based on stream_session_id, not timestamp
        // So if a message was created during Session 92 but assigned to Session 93,
        // it would show up in Session 93's count

        console.log(`\n💡 Key Insight:`)
        console.log(`   Messages are assigned to sessions based on stream_session_id field,`)
        console.log(`   not based on their Kick timestamp.`)
        console.log(`   If ${messagesThatShouldBeIn92.length} messages have Kick timestamps`)
        console.log(`   in Session 92's window but are assigned to Session 93, they would`)
        console.log(`   inflate Session 93's unique chatters count.`)

    } catch (error) {
        console.error('❌ Error:', error)
        process.exit(1)
    } finally {
        await prisma.$disconnect()
    }
}

compareSessions()










