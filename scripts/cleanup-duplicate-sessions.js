#!/usr/bin/env node
/**
 * Cleanup Script for Duplicate Stream Sessions
 *
 * This script:
 * 1. Finds and ends orphaned active sessions (no recent messages)
 * 2. Identifies duplicate sessions (same broadcaster, similar start times)
 * 3. Merges duplicates (keeps lowest ID, sums message counts)
 * 4. Deletes empty duplicate sessions
 * 5. Prepares database for unique constraint
 *
 * Run with: node scripts/cleanup-duplicate-sessions.js
 * Dry run:  node scripts/cleanup-duplicate-sessions.js --dry-run
 */

const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()
const DRY_RUN = process.argv.includes('--dry-run')

async function main() {
    console.log('='.repeat(60))
    console.log('STREAM SESSION CLEANUP SCRIPT')
    console.log(DRY_RUN ? '🔍 DRY RUN MODE - No changes will be made' : '⚠️  LIVE MODE - Changes will be applied')
    console.log('='.repeat(60))
    console.log()

    try {
        // Step 1: End orphaned active sessions (active but no messages in last 2 hours)
        console.log('📋 Step 1: Finding orphaned active sessions...')
        const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000)

        const activeSessions = await prisma.streamSession.findMany({
            where: { ended_at: null },
            select: {
                id: true,
                broadcaster_user_id: true,
                channel_slug: true,
                session_title: true,
                started_at: true,
                _count: {
                    select: { chat_messages: true }
                }
            }
        })

        console.log(`   Found ${activeSessions.length} active session(s)`)

        for (const session of activeSessions) {
            // Check for recent messages
            const recentMessages = await prisma.chatMessage.count({
                where: {
                    stream_session_id: session.id,
                    created_at: { gte: twoHoursAgo }
                }
            })

            // Skip test sessions
            if (session.session_title?.startsWith('[TEST]')) {
                console.log(`   ⏭️  Skipping test session ${session.id}`)
                continue
            }

            if (recentMessages === 0 && session.started_at < twoHoursAgo) {
                console.log(`   🔴 Orphaned session ${session.id} (${session.channel_slug}) - started ${session.started_at.toISOString()}, no recent messages`)

                if (!DRY_RUN) {
                    await prisma.streamSession.update({
                        where: { id: session.id },
                        data: {
                            ended_at: new Date(),
                            updated_at: new Date()
                        }
                    })
                    console.log(`      ✅ Ended session ${session.id}`)
                }
            }
        }

        console.log()

        // Step 2: Find duplicate sessions (same broadcaster, started within 1 minute of each other)
        console.log('📋 Step 2: Finding duplicate sessions...')

        const allSessions = await prisma.streamSession.findMany({
            orderBy: [
                { broadcaster_user_id: 'asc' },
                { started_at: 'asc' }
            ],
            select: {
                id: true,
                broadcaster_user_id: true,
                channel_slug: true,
                session_title: true,
                thumbnail_url: true,
                kick_stream_id: true,
                started_at: true,
                ended_at: true,
                peak_viewer_count: true,
                total_messages: true,
                _count: {
                    select: { chat_messages: true }
                }
            }
        })

        // Group by broadcaster
        const sessionsByBroadcaster = new Map()
        for (const session of allSessions) {
            const key = session.broadcaster_user_id.toString()
            if (!sessionsByBroadcaster.has(key)) {
                sessionsByBroadcaster.set(key, [])
            }
            sessionsByBroadcaster.get(key).push(session)
        }

        let duplicatesFound = 0
        let sessionsDeleted = 0
        let sessionsMerged = 0

        for (const [broadcasterId, sessions] of sessionsByBroadcaster) {
            if (sessions.length < 2) continue

            // Find duplicates (started within 1 minute of each other)
            const processed = new Set()

            for (let i = 0; i < sessions.length; i++) {
                if (processed.has(sessions[i].id.toString())) continue

                const duplicates = [sessions[i]]

                for (let j = i + 1; j < sessions.length; j++) {
                    if (processed.has(sessions[j].id.toString())) continue

                    const timeDiff = Math.abs(sessions[i].started_at.getTime() - sessions[j].started_at.getTime())

                    // Within 1 minute = likely duplicates
                    if (timeDiff < 60000) {
                        duplicates.push(sessions[j])
                        processed.add(sessions[j].id.toString())
                    }
                }

                if (duplicates.length > 1) {
                    duplicatesFound += duplicates.length - 1

                    // Sort by ID to keep lowest (most stable)
                    duplicates.sort((a, b) => Number(a.id - b.id))
                    const primary = duplicates[0]
                    const toMerge = duplicates.slice(1)

                    console.log(`   🔄 Duplicate set found for broadcaster ${broadcasterId}:`)
                    console.log(`      Primary: ID ${primary.id} (${primary.channel_slug}) - ${primary._count.chat_messages} messages`)

                    for (const dup of toMerge) {
                        console.log(`      Duplicate: ID ${dup.id} - ${dup._count.chat_messages} messages`)
                    }

                    if (!DRY_RUN) {
                        // Merge metadata into primary (take best values)
                        const mergedData = {
                            thumbnail_url: primary.thumbnail_url || toMerge.find(d => d.thumbnail_url)?.thumbnail_url,
                            kick_stream_id: primary.kick_stream_id || toMerge.find(d => d.kick_stream_id)?.kick_stream_id,
                            session_title: primary.session_title || toMerge.find(d => d.session_title)?.session_title,
                            peak_viewer_count: Math.max(primary.peak_viewer_count, ...toMerge.map(d => d.peak_viewer_count)),
                            total_messages: primary.total_messages + toMerge.reduce((sum, d) => sum + d.total_messages, 0),
                            // Use earliest start and latest end
                            started_at: new Date(Math.min(primary.started_at.getTime(), ...toMerge.map(d => d.started_at.getTime()))),
                            ended_at: primary.ended_at || toMerge.find(d => d.ended_at)?.ended_at,
                        }

                        // Update primary with merged data
                        await prisma.streamSession.update({
                            where: { id: primary.id },
                            data: mergedData
                        })
                        sessionsMerged++

                        // Move messages from duplicates to primary
                        for (const dup of toMerge) {
                            await prisma.chatMessage.updateMany({
                                where: { stream_session_id: dup.id },
                                data: { stream_session_id: primary.id }
                            })

                            // Move point history
                            await prisma.pointHistory.updateMany({
                                where: { stream_session_id: dup.id },
                                data: { stream_session_id: primary.id }
                            })

                            // Delete associated jobs
                            await prisma.pointAwardJob.deleteMany({
                                where: { stream_session_id: dup.id }
                            })
                            await prisma.chatJob.deleteMany({
                                where: { stream_session_id: dup.id }
                            })

                            // Delete the duplicate session
                            await prisma.streamSession.delete({
                                where: { id: dup.id }
                            })
                            sessionsDeleted++
                            console.log(`      ✅ Merged and deleted duplicate ${dup.id}`)
                        }
                    }
                }

                processed.add(sessions[i].id.toString())
            }
        }

        console.log()
        console.log(`   Found ${duplicatesFound} duplicate session(s)`)
        if (!DRY_RUN) {
            console.log(`   Merged ${sessionsMerged} primary session(s)`)
            console.log(`   Deleted ${sessionsDeleted} duplicate session(s)`)
        }

        console.log()

        // Step 3: Verify no more duplicate active sessions exist
        console.log('📋 Step 3: Verifying unique constraint readiness...')

        const activeAfterCleanup = await prisma.streamSession.findMany({
            where: { ended_at: null },
            select: {
                id: true,
                broadcaster_user_id: true,
                channel_slug: true
            }
        })

        const activeByBroadcaster = new Map()
        for (const session of activeAfterCleanup) {
            const key = session.broadcaster_user_id.toString()
            if (!activeByBroadcaster.has(key)) {
                activeByBroadcaster.set(key, [])
            }
            activeByBroadcaster.get(key).push(session)
        }

        let hasConflicts = false
        for (const [broadcasterId, sessions] of activeByBroadcaster) {
            if (sessions.length > 1) {
                hasConflicts = true
                console.log(`   ⚠️  Broadcaster ${broadcasterId} still has ${sessions.length} active sessions:`)
                for (const s of sessions) {
                    console.log(`      - ID ${s.id} (${s.channel_slug})`)
                }
            }
        }

        if (!hasConflicts) {
            console.log('   ✅ Database is ready for unique constraint!')
        } else {
            console.log('   ⚠️  Manual intervention needed for remaining conflicts')
        }

        console.log()
        console.log('='.repeat(60))
        console.log('CLEANUP COMPLETE')
        console.log('='.repeat(60))

    } catch (error) {
        console.error('❌ Error during cleanup:', error)
        process.exit(1)
    } finally {
        await prisma.$disconnect()
    }
}

main()
