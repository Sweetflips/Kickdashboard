/**
 * Cleanup script to remove incorrectly assigned messages from a stream session
 * This removes messages that:
 * - Were created before the session started
 * - Have invalid user IDs (<= 0)
 * - Were sent when offline
 *
 * Usage: node scripts/cleanup-session-messages.js <session_id> [--dry-run]
 */

const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function cleanupSessionMessages(sessionId, dryRun = false) {
    try {
        const sessionIdBigInt = BigInt(sessionId)

        // Get session info
        const session = await prisma.streamSession.findUnique({
            where: { id: sessionIdBigInt },
            select: {
                id: true,
                session_title: true,
                started_at: true,
                ended_at: true,
                channel_slug: true,
            },
        })

        if (!session) {
            console.error(`❌ Session ${sessionId} not found`)
            process.exit(1)
        }

        console.log(`\n📊 Session Info:`)
        console.log(`   ID: ${session.id}`)
        console.log(`   Title: ${session.session_title || 'Untitled'}`)
        console.log(`   Started: ${session.started_at.toISOString()}`)
        console.log(`   Mode: ${dryRun ? 'DRY RUN (no changes will be made)' : 'LIVE (will update database)'}`)

        // Find messages that should be removed
        const messagesToRemove = await prisma.chatMessage.findMany({
            where: {
                stream_session_id: sessionIdBigInt,
                OR: [
                    { sender_user_id: { lte: BigInt(0) } }, // Invalid user ID
                    { created_at: { lt: session.started_at } }, // Before session started
                    { sent_when_offline: true }, // Sent when offline
                ],
            },
            select: {
                id: true,
                message_id: true,
                sender_user_id: true,
                sender_username: true,
                created_at: true,
                sent_when_offline: true,
            },
        })

        console.log(`\n🔍 Found ${messagesToRemove.length} messages to remove:`)

        const invalidUserId = messagesToRemove.filter(m => m.sender_user_id <= BigInt(0))
        const beforeStart = messagesToRemove.filter(m => new Date(m.created_at) < session.started_at)
        const offline = messagesToRemove.filter(m => m.sent_when_offline)

        console.log(`   - Invalid user ID (<= 0): ${invalidUserId.length}`)
        console.log(`   - Created before session start: ${beforeStart.length}`)
        console.log(`   - Sent when offline: ${offline.length}`)

        if (messagesToRemove.length === 0) {
            console.log(`\n✅ No messages need to be removed!`)
            return
        }

        // Show sample of messages to be removed
        console.log(`\n📋 Sample messages to be removed:`)
        messagesToRemove.slice(0, 10).forEach(msg => {
            const reasons = []
            if (msg.sender_user_id <= BigInt(0)) reasons.push('invalid user ID')
            if (new Date(msg.created_at) < session.started_at) reasons.push('before session start')
            if (msg.sent_when_offline) reasons.push('sent offline')
            console.log(`   - ${msg.sender_username} (ID: ${msg.sender_user_id}) at ${msg.created_at.toISOString()} [${reasons.join(', ')}]`)
        })
        if (messagesToRemove.length > 10) {
            console.log(`   ... and ${messagesToRemove.length - 10} more`)
        }

        if (dryRun) {
            console.log(`\n⚠️  DRY RUN: No changes made. Run without --dry-run to apply changes.`)
            return
        }

        // Remove stream_session_id from these messages (set to null)
        console.log(`\n🗑️  Removing stream_session_id from ${messagesToRemove.length} messages...`)

        const messageIds = messagesToRemove.map(m => m.id)

        const result = await prisma.chatMessage.updateMany({
            where: {
                id: { in: messageIds },
            },
            data: {
                stream_session_id: null,
            },
        })

        console.log(`✅ Updated ${result.count} messages (removed stream_session_id)`)

        // Verify the cleanup
        const remainingMessages = await prisma.chatMessage.count({
            where: {
                stream_session_id: sessionIdBigInt,
                sender_user_id: { gt: BigInt(0) },
                created_at: { gte: session.started_at },
                sent_when_offline: false,
            },
        })

        const uniqueChatters = await prisma.chatMessage.groupBy({
            by: ['sender_user_id'],
            where: {
                stream_session_id: sessionIdBigInt,
                sender_user_id: { gt: BigInt(0) },
                created_at: { gte: session.started_at },
                sent_when_offline: false,
            },
        })

        console.log(`\n✅ After cleanup:`)
        console.log(`   - Valid messages remaining: ${remainingMessages}`)
        console.log(`   - Unique chatters: ${uniqueChatters.length}`)

    } catch (error) {
        console.error('❌ Error:', error)
        process.exit(1)
    } finally {
        await prisma.$disconnect()
    }
}

// Parse command line arguments
const args = process.argv.slice(2)
const sessionId = args.find(arg => !arg.startsWith('--'))
const dryRun = args.includes('--dry-run')

if (!sessionId) {
    console.error('Usage: node scripts/cleanup-session-messages.js <session_id> [--dry-run]')
    console.error('Example: node scripts/cleanup-session-messages.js 123456789')
    console.error('Example (dry run): node scripts/cleanup-session-messages.js 123456789 --dry-run')
    process.exit(1)
}

cleanupSessionMessages(sessionId, dryRun)












