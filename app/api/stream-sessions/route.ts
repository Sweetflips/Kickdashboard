import { isAdmin } from '@/lib/auth'
import { db } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { NextResponse } from 'next/server'
import { rewriteApiMediaUrlToCdn } from '@/lib/media-url'
import { fetchKickV2ChannelVideos } from '@/lib/kick-videos'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
    try {
        // Check admin access - Past Streams are admin-only
        const adminCheck = await isAdmin(request)
        if (!adminCheck) {
            return NextResponse.json(
                { error: 'Unauthorized - Admin access required' },
                { status: 403 }
            )
        }

        const { searchParams } = new URL(request.url)
        const limit = Math.max(1, Math.min(100, parseInt(searchParams.get('limit') || '50', 10) || 50))
        const offset = Math.max(0, parseInt(searchParams.get('offset') || '0', 10) || 0)
        const broadcasterUserId = searchParams.get('broadcaster_user_id')
        const skipDeduplication = searchParams.get('skip_deduplication') === 'true'

        const where: Prisma.StreamSessionWhereInput = {
            ended_at: { not: null }, // Only show ended streams for Past Streams
        }

        // Safely convert broadcasterUserId to BigInt if provided
        if (broadcasterUserId) {
            try {
                const userId = BigInt(broadcasterUserId)
                where.broadcaster_user_id = userId
            } catch (error) {
                return NextResponse.json(
                    { error: 'Invalid broadcaster_user_id format' },
                    { status: 400 }
                )
            }
        }

        // Fetch all sessions (or a reasonable limit) to deduplicate properly
        const allSessions = await db.streamSession.findMany({
            where,
            orderBy: { started_at: 'desc' },
            take: 1000, // Reasonable limit for deduplication
            include: {
                broadcaster: {
                    select: {
                        username: true,
                        profile_picture_url: true,
                    },
                },
            },
        })

        // Deduplicate sessions: same broadcaster, same started_at (within 1 minute), keep the one with LOWEST ID (most stable)
        // This ensures that when you delete a session, you don't see a different "duplicate" appear
        // Admin can skip deduplication to see all sessions
        let deduplicatedSessions = allSessions

        if (!skipDeduplication) {
            deduplicatedSessions = allSessions.reduce((acc, session) => {
                const existingIndex = acc.findIndex(s =>
                    s.broadcaster_user_id === session.broadcaster_user_id &&
                    Math.abs(s.started_at.getTime() - session.started_at.getTime()) < 60000 // Within 1 minute
                )

                if (existingIndex === -1) {
                    acc.push(session)
                } else {
                    // Always keep the session with the LOWEST ID (oldest/created first) for stability
                    // This ensures that deleting one session doesn't reveal another "duplicate"
                    const existing = acc[existingIndex]
                    if (session.id < existing.id) {
                        acc[existingIndex] = session
                    }
                    // Otherwise, keep the existing one (don't replace)
                }
                return acc
            }, [] as typeof allSessions)
        }

        // Paginate after deduplication
        const total = deduplicatedSessions.length
        const paginatedSessions = deduplicatedSessions.slice(offset, offset + limit)

        // Auto-refresh VOD thumbnails for recent ended sessions (keeps "green placeholder" thumbnails from sticking).
        // This uses Kick's v2 /videos endpoint and updates thumbnail_url/kick_stream_id/title when it finds a better match.
        try {
            const now = Date.now()
            const refreshWindowMs = 7 * 24 * 60 * 60 * 1000 // last 7 days only
            const refreshIntervalMs = 2 * 60 * 60 * 1000 // refresh at most every 2 hours

            const needsRefresh = (s: any) => {
                if (!s?.ended_at) return false
                const endedAt = s.ended_at instanceof Date ? s.ended_at : new Date(s.ended_at)
                if (isNaN(endedAt.getTime())) return false
                if (now - endedAt.getTime() > refreshWindowMs) return false

                const last = s.thumbnail_last_refreshed_at instanceof Date
                    ? s.thumbnail_last_refreshed_at
                    : (s.thumbnail_last_refreshed_at ? new Date(s.thumbnail_last_refreshed_at) : null)

                if (!last || isNaN(last.getTime())) return true
                return now - last.getTime() > refreshIntervalMs
            }

            const sessionsToRefresh = paginatedSessions.filter(needsRefresh)
            if (sessionsToRefresh.length > 0) {
                const bySlug = new Map<string, any[]>()
                for (const s of sessionsToRefresh) {
                    const slug = (s.channel_slug || '').toString().trim().toLowerCase()
                    if (!slug) continue
                    if (!bySlug.has(slug)) bySlug.set(slug, [])
                    bySlug.get(slug)!.push(s)
                }

                for (const [slug, sessions] of bySlug.entries()) {
                    const videos = await fetchKickV2ChannelVideos(slug)
                    if (!videos || videos.length === 0) continue

                    // Only consider videos with a valid start time
                    const usable = videos.filter(v => v.startTime && !isNaN(v.startTime.getTime()))
                    if (usable.length === 0) continue

                    for (const session of sessions) {
                        const startedAt = session.started_at instanceof Date ? session.started_at : new Date(session.started_at)
                        if (isNaN(startedAt.getTime())) continue

                        // Find closest video by start time within 45 minutes (Kick timestamps can drift a bit)
                        const maxDiffMs = 45 * 60 * 1000
                        let best: (typeof usable)[number] | null = null
                        let bestDiff = Infinity
                        for (const v of usable) {
                            const diff = Math.abs(v.startTime!.getTime() - startedAt.getTime())
                            if (diff < bestDiff) {
                                bestDiff = diff
                                best = v
                            }
                        }
                        if (!best || bestDiff > maxDiffMs) continue

                        const updateData: Prisma.StreamSessionUpdateInput = {
                            thumbnail_last_refreshed_at: new Date(),
                            thumbnail_source: 'kick_vod_auto',
                        }
                        let changed = false

                        if (best.thumbnailUrl && best.thumbnailUrl !== session.thumbnail_url) {
                            updateData.thumbnail_url = best.thumbnailUrl
                            updateData.thumbnail_captured_at = session.thumbnail_captured_at || new Date()
                            changed = true
                        }

                        if (best.vodId && best.vodId !== session.kick_stream_id) {
                            updateData.kick_stream_id = best.vodId
                            changed = true
                        }

                        if (best.title) {
                            const currentTitle = (session.session_title || '').trim()
                            if (!currentTitle || currentTitle === 'Untitled Stream') {
                                updateData.session_title = best.title
                                changed = true
                            }
                        }

                        if (changed) {
                            const updated = await db.streamSession.update({
                                where: { id: session.id },
                                data: updateData,
                            })
                            // Keep response in sync without a re-query
                            session.thumbnail_url = updated.thumbnail_url
                            session.kick_stream_id = updated.kick_stream_id
                            session.session_title = updated.session_title
                            session.thumbnail_last_refreshed_at = updated.thumbnail_last_refreshed_at
                            session.thumbnail_source = updated.thumbnail_source
                        }
                    }
                }
            }
        } catch (e) {
            // Non-fatal: Past Streams should still render even if Kick blocks /videos temporarily.
        }

        // Calculate duration for completed streams with null safety
        const sessionsWithDuration = paginatedSessions.map(session => {
            let duration: number | null = null
            if (session.ended_at && session.started_at) {
                try {
                    duration = Math.floor((session.ended_at.getTime() - session.started_at.getTime()) / 1000)
                    // Ensure duration is non-negative
                    if (duration < 0) duration = 0
                } catch (error) {
                    console.error('Error calculating duration for session:', session.id, error)
                    duration = null
                }
            }

            return {
                id: session.id.toString(),
                broadcaster_user_id: session.broadcaster_user_id.toString(),
                channel_slug: session.channel_slug || '',
                session_title: session.session_title || null,
                thumbnail_url: session.thumbnail_url || null,
                kick_stream_id: session.kick_stream_id || null,
                started_at: session.started_at?.toISOString() || new Date().toISOString(),
                ended_at: session.ended_at?.toISOString() || null,
                peak_viewer_count: session.peak_viewer_count || 0,
                total_messages: session.total_messages || 0,
                duration_seconds: duration,
                duration_formatted: duration !== null && duration >= 0 ? formatDuration(duration) : null,
                broadcaster: session.broadcaster
                    ? {
                        ...session.broadcaster,
                        profile_picture_url: rewriteApiMediaUrlToCdn(session.broadcaster.profile_picture_url),
                    }
                    : {
                        username: 'Unknown',
                        profile_picture_url: null,
                    },
            }
        })

        return NextResponse.json({
            sessions: sessionsWithDuration,
            total,
            limit,
            offset,
        })
    } catch (error) {
        console.error('Error fetching stream sessions:', error)
        return NextResponse.json(
            { error: 'Failed to fetch stream sessions', details: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        )
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json()
        const {
            broadcaster_user_id,
            channel_slug,
            session_title,
            started_at,
        } = body

        if (!broadcaster_user_id || !channel_slug) {
            return NextResponse.json(
                { error: 'broadcaster_user_id and channel_slug are required' },
                { status: 400 }
            )
        }

        // Check if there's an active session for this broadcaster
        const activeSession = await db.streamSession.findFirst({
            where: {
                broadcaster_user_id: BigInt(broadcaster_user_id),
                ended_at: null,
            },
            orderBy: { started_at: 'desc' },
        })

        if (activeSession) {
            // Update existing active session
            const updated = await db.streamSession.update({
                where: { id: activeSession.id },
                data: {
                    session_title: session_title || activeSession.session_title,
                    updated_at: new Date(),
                },
            })

            return NextResponse.json({
                success: true,
                session: {
                    ...updated,
                    id: updated.id.toString(),
                    broadcaster_user_id: updated.broadcaster_user_id.toString(),
                },
                message: 'Updated existing active session',
            })
        }

        // Create new session
        const session = await db.streamSession.create({
            data: {
                broadcaster_user_id: BigInt(broadcaster_user_id),
                channel_slug,
                session_title: session_title || null,
                started_at: started_at ? new Date(started_at) : new Date(),
            },
        })

        return NextResponse.json({
            success: true,
            session: {
                ...session,
                id: session.id.toString(),
                broadcaster_user_id: session.broadcaster_user_id.toString(),
            },
            message: 'Created new stream session',
        })
    } catch (error) {
        console.error('Error creating stream session:', error)
        return NextResponse.json(
            { error: 'Failed to create stream session', details: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        )
    }
}

export async function PATCH(request: Request) {
    try {
        const body = await request.json()
        const {
            session_id,
            session_title,
            peak_viewer_count,
            total_messages,
            ended_at,
        } = body

        if (!session_id) {
            return NextResponse.json(
                { error: 'session_id is required' },
                { status: 400 }
            )
        }

        const updateData: any = {
            updated_at: new Date(),
        }

        if (session_title !== undefined) updateData.session_title = session_title
        if (peak_viewer_count !== undefined) updateData.peak_viewer_count = peak_viewer_count
        if (total_messages !== undefined) updateData.total_messages = total_messages
        if (ended_at !== undefined) updateData.ended_at = ended_at ? new Date(ended_at) : null

        const session = await db.streamSession.update({
            where: { id: BigInt(session_id) },
            data: updateData,
        })

        return NextResponse.json({
            success: true,
            session: {
                ...session,
                id: session.id.toString(),
                broadcaster_user_id: session.broadcaster_user_id.toString(),
            },
            message: 'Updated stream session',
        })
    } catch (error) {
        console.error('Error updating stream session:', error)
        return NextResponse.json(
            { error: 'Failed to update stream session', details: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        )
    }
}

export async function DELETE(request: Request) {
    try {
        // Check admin access - Only admins can delete streams
        const adminCheck = await isAdmin(request)
        if (!adminCheck) {
            return NextResponse.json(
                { error: 'Unauthorized - Admin access required' },
                { status: 403 }
            )
        }

        const { searchParams } = new URL(request.url)
        const sessionId = searchParams.get('id')

        if (!sessionId) {
            return NextResponse.json(
                { error: 'session_id is required' },
                { status: 400 }
            )
        }

        // Convert to BigInt
        let sessionIdBigInt: bigint
        try {
            sessionIdBigInt = BigInt(sessionId)
        } catch (error) {
            return NextResponse.json(
                { error: 'Invalid session_id format' },
                { status: 400 }
            )
        }

        // Check if session exists and get its details for duplicate detection
        const session = await db.streamSession.findUnique({
            where: { id: sessionIdBigInt },
            select: {
                id: true,
                broadcaster_user_id: true,
                started_at: true
            },
        })

        if (!session) {
            return NextResponse.json(
                { error: 'Stream session not found' },
                { status: 404 }
            )
        }

        // Find duplicate sessions (same broadcaster, started within 1 minute)
        const timeWindow = 60 * 1000 // 1 minute
        const duplicateSessions = await db.streamSession.findMany({
            where: {
                broadcaster_user_id: session.broadcaster_user_id,
                started_at: {
                    gte: new Date(session.started_at.getTime() - timeWindow),
                    lte: new Date(session.started_at.getTime() + timeWindow),
                },
            },
            select: { id: true },
        })

        const allSessionIds = duplicateSessions.map(s => s.id)
        const deletedCount = allSessionIds.length

        console.log(`[DELETE] Deleting ${deletedCount} session(s) (primary: ${sessionIdBigInt}, duplicates: ${allSessionIds.filter(id => id !== sessionIdBigInt).map(id => id.toString()).join(', ') || 'none'})`)

        // Delete related records first (chat messages, Sweet Coins history, jobs)
        // This prevents foreign key constraint errors
        try {
            for (const sid of allSessionIds) {
                // Delete chat messages associated with this session
                await db.chatMessage.deleteMany({
                    where: { stream_session_id: sid },
                })

                // Delete Sweet Coins history associated with this session
                await db.sweetCoinHistory.deleteMany({
                    where: { stream_session_id: sid },
                })

                // Delete Sweet Coins award jobs associated with this session
                await db.sweetCoinAwardJob.deleteMany({
                    where: { stream_session_id: sid },
                })

                // Delete chat jobs associated with this session
                await db.chatJob.deleteMany({
                    where: { stream_session_id: sid },
                })

                // Delete the session itself
                await db.streamSession.delete({
                    where: { id: sid },
                })
            }

            return NextResponse.json({
                success: true,
                message: deletedCount > 1
                    ? `Deleted ${deletedCount} sessions (including ${deletedCount - 1} duplicate(s))`
                    : 'Stream session deleted successfully',
                deleted_count: deletedCount,
            })
        } catch (dbError: any) {
            // Handle foreign key constraint errors specifically
            if (dbError?.code === 'P2003' || dbError?.message?.includes('foreign key constraint')) {
                console.error('Foreign key constraint error deleting stream session:', dbError)
                return NextResponse.json(
                    {
                        error: 'Cannot delete stream session - it has related records that prevent deletion',
                        details: 'This session has related records (chat messages, Sweet Coins history, or jobs) that need to be deleted first',
                    },
                    { status: 409 }
                )
            }
            throw dbError
        }
    } catch (error) {
        console.error('Error deleting stream session:', error)
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        return NextResponse.json(
            { error: 'Failed to delete stream session', details: errorMessage },
            { status: 500 }
        )
    }
}

function formatDuration(seconds: number): string {
    // Ensure seconds is a valid positive number
    const safeSeconds = Math.max(0, Math.floor(seconds || 0))

    const hours = Math.floor(safeSeconds / 3600)
    const minutes = Math.floor((safeSeconds % 3600) / 60)
    const secs = safeSeconds % 60

    if (hours > 0) {
        return `${hours}h ${minutes}m ${secs}s`
    } else if (minutes > 0) {
        return `${minutes}m ${secs}s`
    } else {
        return `${secs}s`
    }
}
