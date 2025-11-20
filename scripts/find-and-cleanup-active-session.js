/**
 * Find the active stream session and cleanup incorrectly assigned messages
 * Usage: node scripts/find-and-cleanup-active-session.js [--dry-run]
 */

const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function findAndCleanupActiveSession(dryRun = false) {
    try {
        // Find active session (not ended, most recent)
        const activeSession = await prisma.streamSession.findFirst({
            where: {
                ended_at: null, // Still active
            },
            orderBy: {
                started_at: 'desc', // Most recent
            },
            select: {
                id: true,
                session_title: true,
                started_at: true,
                ended_at: true,
                channel_slug: true,
                broadcaster_user_id: true,
            },
        })

        if (!activeSession) {
            console.log('❌ No active session found')
            
            // Try to find the most recent session (even if ended)
            const recentSession = await prisma.streamSession.findFirst({
                orderBy: {
                    started_at: 'desc',
                },
                select: {
                    id: true,
                    session_title: true,
                    started_at: true,
                    ended_at: true,
                    channel_slug: true,
                },
            })

            if (recentSession) {
                console.log(`\n📊 Most recent session:`)
                console.log(`   ID: ${recentSession.id}`)
                console.log(`   Title: ${recentSession.session_title || 'Untitled'}`)
                console.log(`   Channel: ${recentSession.channel_slug}`)
                console.log(`   Started: ${recentSession.started_at.toISOString()}`)
                console.log(`   Ended: ${recentSession.ended_at ? recentSession.ended_at.toISOString() : 'Still active'}`)
                console.log(`\n💡 To cleanup this session, run:`)
                console.log(`   node scripts/cleanup-session-messages.js ${recentSession.id}${dryRun ? ' --dry-run' : ''}`)
            }
            
            process.exit(1)
        }

        console.log(`\n✅ Found active session:`)
        console.log(`   ID: ${activeSession.id}`)
        console.log(`   Title: ${activeSession.session_title || 'Untitled'}`)
        console.log(`   Channel: ${activeSession.channel_slug}`)
        console.log(`   Started: ${activeSession.started_at.toISOString()}`)
        console.log(`   Mode: ${dryRun ? 'DRY RUN (no changes will be made)' : 'LIVE (will update database)'}`)

        // Find messages that should be removed
        const messagesToRemove = await prisma.chatMessage.findMany({
            where: {
                stream_session_id: activeSession.id,
                OR: [
                    { sender_user_id: { lte: BigInt(0) } }, // Invalid user ID
                    { created_at: { lt: activeSession.started_at } }, // Before session started
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
        const beforeStart = messagesToRemove.filter(m => new Date(m.created_at) < activeSession.started_at)
        const offline = messagesToRemove.filter(m => m.sent_when_offline)

        console.log(`   - Invalid user ID (<= 0): ${invalidUserId.length}`)
        console.log(`   - Created before session start: ${beforeStart.length}`)
        console.log(`   - Sent when offline: ${offline.length}`)

        if (messagesToRemove.length === 0) {
            console.log(`\n✅ No messages need to be removed! Session is clean.`)
            
            // Show current stats
            const validMessages = await prisma.chatMessage.count({
                where: {
                    stream_session_id: activeSession.id,
                    sender_user_id: { gt: BigInt(0) },
                    created_at: { gte: activeSession.started_at },
                    sent_when_offline: false,
                },
            })

            const uniqueChatters = await prisma.chatMessage.groupBy({
                by: ['sender_user_id'],
                where: {
                    stream_session_id: activeSession.id,
                    sender_user_id: { gt: BigInt(0) },
                    created_at: { gte: activeSession.started_at },
                    sent_when_offline: false,
                },
            })

            console.log(`\n📊 Current stats:`)
            console.log(`   - Valid messages: ${validMessages}`)
            console.log(`   - Unique chatters: ${uniqueChatters.length}`)
            return
        }

        // Show sample of messages to be removed
        console.log(`\n📋 Sample messages to be removed:`)
        messagesToRemove.slice(0, 10).forEach(msg => {
            const reasons = []
            if (msg.sender_user_id <= BigInt(0)) reasons.push('invalid user ID')
            if (new Date(msg.created_at) < activeSession.started_at) reasons.push('before session start')
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
                stream_session_id: activeSession.id,
                sender_user_id: { gt: BigInt(0) },
                created_at: { gte: activeSession.started_at },
                sent_when_offline: false,
            },
        })

        const uniqueChatters = await prisma.chatMessage.groupBy({
            by: ['sender_user_id'],
            where: {
                stream_session_id: activeSession.id,
                sender_user_id: { gt: BigInt(0) },
                created_at: { gte: activeSession.started_at },
                sent_when_offline: false,
            },
        })

        console.log(`\n✅ After cleanup:`)
        console.log(`   - Valid messages remaining: ${remainingMessages}`)
        console.log(`   - Unique chatters: ${uniqueChatters.length}`)
        console.log(`\n🎉 Session ${activeSession.id} has been cleaned up!`)

    } catch (error) {
        console.error('❌ Error:', error)
        process.exit(1)
    } finally {
        await prisma.$disconnect()
    }
}

// Parse command line arguments
const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')

findAndCleanupActiveSession(dryRun)

