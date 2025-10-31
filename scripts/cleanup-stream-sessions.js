require('dotenv').config({ path: '.env.local' })
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

async function cleanupStreamSessions() {
    try {
        console.log('🔍 Finding stream session to keep...')

        // Find the broadcaster user ID for sweetflips
        const broadcaster = await prisma.user.findFirst({
            where: {
                username: {
                    equals: 'sweetflips',
                    mode: 'insensitive',
                },
            },
        })

        if (!broadcaster) {
            console.error('❌ Could not find broadcaster "sweetflips"')
            process.exit(1)
        }

        console.log(`✅ Found broadcaster: ${broadcaster.username} (ID: ${broadcaster.kick_user_id})`)

        // Find the stream session to keep
        // Match by title, stats, and approximate dates
        // Date format: 31-10-2025, 14:42:18 (DD-MM-YYYY)
        // Parse as: 2025-10-31T14:42:18 (ISO format)
        const targetStartDate = new Date('2025-10-31T14:42:18')
        const targetEndDate = new Date('2025-10-31T17:10:40')

        // Try to find session matching title and stats first
        let sessionToKeep = await prisma.streamSession.findFirst({
            where: {
                broadcaster_user_id: broadcaster.kick_user_id,
                channel_slug: 'sweetflips',
                session_title: {
                    contains: 'LUXDROP',
                },
                peak_viewer_count: 368,
                total_messages: 4801,
            },
            orderBy: {
                started_at: 'desc',
            },
        })

        // If not found by exact stats, try matching by title only
        if (!sessionToKeep) {
            sessionToKeep = await prisma.streamSession.findFirst({
                where: {
                    broadcaster_user_id: broadcaster.kick_user_id,
                    channel_slug: 'sweetflips',
                    session_title: {
                        contains: 'LUXDROP',
                    },
                },
                orderBy: {
                    started_at: 'desc',
                },
            })
        }

        if (!sessionToKeep) {
            console.error('❌ Could not find the target stream session')
            console.log('📋 Available sessions:')
            const allSessions = await prisma.streamSession.findMany({
                where: {
                    broadcaster_user_id: broadcaster.kick_user_id,
                },
                orderBy: {
                    started_at: 'desc',
                },
            })

            allSessions.forEach(session => {
                console.log(`  - ID: ${session.id}`)
                console.log(`    Title: ${session.session_title || 'N/A'}`)
                console.log(`    Started: ${session.started_at}`)
                console.log(`    Ended: ${session.ended_at || 'Still active'}`)
                console.log(`    Peak Viewers: ${session.peak_viewer_count}`)
                console.log(`    Messages: ${session.total_messages}`)
                console.log('')
            })

            process.exit(1)
        }

        console.log(`✅ Found session to keep:`)
        console.log(`   ID: ${sessionToKeep.id}`)
        console.log(`   Title: ${sessionToKeep.session_title}`)
        console.log(`   Started: ${sessionToKeep.started_at}`)
        console.log(`   Ended: ${sessionToKeep.ended_at}`)
        console.log(`   Peak Viewers: ${sessionToKeep.peak_viewer_count}`)
        console.log(`   Messages: ${sessionToKeep.total_messages}`)
        console.log('')

        // Get count of sessions to delete
        const sessionsToDelete = await prisma.streamSession.findMany({
            where: {
                broadcaster_user_id: broadcaster.kick_user_id,
                id: {
                    not: sessionToKeep.id,
                },
            },
        })

        console.log(`🗑️  Found ${sessionsToDelete.length} session(s) to delete`)

        if (sessionsToDelete.length === 0) {
            console.log('✅ No sessions to delete. Database is already clean.')
            return
        }

        // Show what will be deleted
        console.log('\n📋 Sessions to be deleted:')
        sessionsToDelete.forEach(session => {
            console.log(`  - ID: ${session.id}`)
            console.log(`    Title: ${session.session_title || 'N/A'}`)
            console.log(`    Started: ${session.started_at}`)
            console.log(`    Ended: ${session.ended_at || 'Still active'}`)
            console.log('')
        })

        // Delete all other sessions
        console.log('🗑️  Deleting sessions...')

        const deleteResult = await prisma.streamSession.deleteMany({
            where: {
                broadcaster_user_id: broadcaster.kick_user_id,
                id: {
                    not: sessionToKeep.id,
                },
            },
        })

        console.log(`✅ Successfully deleted ${deleteResult.count} session(s)`)
        console.log(`✅ Kept session ID: ${sessionToKeep.id}`)

        // Verify final state
        const remainingSessions = await prisma.streamSession.findMany({
            where: {
                broadcaster_user_id: broadcaster.kick_user_id,
            },
        })

        console.log(`\n📊 Remaining sessions: ${remainingSessions.length}`)
        if (remainingSessions.length === 1) {
            console.log('✅ Cleanup complete! Only the target session remains.')
        } else {
            console.log('⚠️  Warning: More than one session remains')
        }

    } catch (error) {
        console.error('❌ Error cleaning up stream sessions:', error)
        process.exit(1)
    } finally {
        await prisma.$disconnect()
    }
}

cleanupStreamSessions()
