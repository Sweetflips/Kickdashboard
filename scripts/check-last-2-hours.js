/**
 * Check unique chatters in the last 2 hours
 * Usage: node scripts/check-last-2-hours.js [session_id]
 */

const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function checkLast2Hours(sessionId = null) {
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

        console.log(`\n📊 Checking last 2 hours for Session ${session.id}:`)
        console.log(`   Session started: ${session.started_at.toISOString()}`)
        console.log(`   Current time: ${now.toISOString()}`)
        console.log(`   Checking messages from: ${twoHoursAgo.toISOString()} to ${now.toISOString()}`)

        // Get messages from last 2 hours
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
                created_at: true,
            },
            orderBy: {
                created_at: 'asc',
            },
        })

        const uniqueUserIds = new Set(messagesLast2Hours.map(m => m.sender_user_id.toString()))
        const uniqueUsernames = new Set(messagesLast2Hours.map(m => m.sender_username.toLowerCase()))

        console.log(`\n📊 Results for LAST 2 HOURS:`)
        console.log(`   Total messages: ${messagesLast2Hours.length}`)
        console.log(`   Unique chatters (by user_id): ${uniqueUserIds.size}`)
        console.log(`   Unique usernames: ${uniqueUsernames.size}`)

        // Also check full session for comparison
        const allSessionMessages = await prisma.chatMessage.findMany({
            where: {
                stream_session_id: session.id,
                sender_user_id: { gt: BigInt(0) },
                created_at: { gte: session.started_at },
                sent_when_offline: false,
            },
            select: {
                sender_user_id: true,
                created_at: true,
            },
        })

        const allUniqueUserIds = new Set(allSessionMessages.map(m => m.sender_user_id.toString()))
        const sessionDuration = (now - session.started_at) / 1000 / 60 // minutes

        console.log(`\n📊 Full Session Comparison:`)
        console.log(`   Session duration: ${sessionDuration.toFixed(1)} minutes`)
        console.log(`   Total messages in session: ${allSessionMessages.length}`)
        console.log(`   Unique chatters in full session: ${allUniqueUserIds.size}`)
        console.log(`   Unique chatters in last 2 hours: ${uniqueUserIds.size}`)

        // Show message distribution by 30-minute windows in last 2 hours
        const messagesBy30Min = {}
        messagesLast2Hours.forEach(msg => {
            const msgTime = new Date(msg.created_at)
            const windowStart = new Date(Math.floor(msgTime / (30 * 60 * 1000)) * (30 * 60 * 1000))
            const windowKey = windowStart.toISOString()
            if (!messagesBy30Min[windowKey]) {
                messagesBy30Min[windowKey] = { messages: 0, uniqueUsers: new Set() }
            }
            messagesBy30Min[windowKey].messages++
            messagesBy30Min[windowKey].uniqueUsers.add(msg.sender_user_id.toString())
        })

        console.log(`\n📈 Message distribution in last 2 hours (30-min windows):`)
        Object.entries(messagesBy30Min)
            .sort(([a], [b]) => a.localeCompare(b))
            .forEach(([window, data]) => {
                console.log(`   ${window}: ${data.messages} messages, ${data.uniqueUsers.size} unique users`)
            })

        // Check if session started more than 2 hours ago
        const sessionStartTime = session.started_at
        const hoursSinceStart = (now - sessionStartTime) / 1000 / 60 / 60

        if (hoursSinceStart > 2) {
            console.log(`\n⚠️  Session started ${hoursSinceStart.toFixed(1)} hours ago`)
            console.log(`   So "last 2 hours" is a subset of the full session`)
            console.log(`   Full session has ${allUniqueUserIds.size} unique chatters`)
            console.log(`   Last 2 hours has ${uniqueUserIds.size} unique chatters`)
        } else {
            console.log(`\n✅ Session started ${hoursSinceStart.toFixed(1)} hours ago`)
            console.log(`   So "last 2 hours" covers most/all of the session`)
        }

    } catch (error) {
        console.error('❌ Error:', error)
        process.exit(1)
    } finally {
        await prisma.$disconnect()
    }
}

const sessionId = process.argv[2]
checkLast2Hours(sessionId)







