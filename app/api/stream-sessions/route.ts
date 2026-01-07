import { isAdmin, canViewPayouts } from '@/lib/auth'
import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

// Define types locally since Prisma Accelerate doesn't export input types
type StreamSessionWhereInput = {
    ended_at?: { not: null } | null
    broadcaster_user_id?: bigint
}

type StreamSessionUpdateData = {
    thumbnail_last_refreshed_at?: Date
    thumbnail_source?: string
    thumbnail_url?: string
    thumbnail_captured_at?: Date
    kick_stream_id?: string
    session_title?: string
    ended_at?: Date
    started_at?: Date
    duration_seconds?: number
}
import { rewriteApiMediaUrlToCdn } from '@/lib/media-url'
import { fetchKickV2ChannelVideos } from '@/lib/kick-videos'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
    try {
        const prisma = db as any
        // Check access - Past Streams accessible to admins and moderators (for payouts)
        const accessCheck = await canViewPayouts(request)
        if (!accessCheck) {
            return NextResponse.json(
                { error: 'Unauthorized - Admin or Moderator access required' },
                { status: 403 }
            )
        }

        const { searchParams } = new URL(request.url)
        const limit = Math.max(1, Math.min(100, parseInt(searchParams.get('limit') || '50', 10) || 50))
        const offset = Math.max(0, parseInt(searchParams.get('offset') || '0', 10) || 0)
        const broadcasterUserId = searchParams.get('broadcaster_user_id')
        const skipDeduplication = searchParams.get('skip_deduplication') === 'true'

        const where: StreamSessionWhereInput = {
            ended_at: { not: null }, // Only show ended streams for Past Streams
        }

        // Safely convert broadcasterUserId to BigInt if provided
        if (broadcasterUserId) {
            try {
                const prisma = db as any
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
        const allSessions = await prisma.streamSession.findMany({
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

        // Deduplicate sessions with improved logic:
        // 1. If kick_stream_id exists: group by (broadcaster_user_id, kick_stream_id) - most reliable
        // 2. Else: group by (broadcaster_user_id, started_at within 60s) - fallback
        // Always keep the session with LONGEST duration (the real stream, not a phantom short session)
        // Admin can skip deduplication to see all sessions
        let deduplicatedSessions = allSessions

        if (!skipDeduplication) {
            deduplicatedSessions = (allSessions as any[]).reduce((acc: any[], session: any) => {
                // First, try to find duplicate by kick_stream_id (most reliable)
                let existingIndex = -1

                if (session.kick_stream_id) {
                    existingIndex = acc.findIndex((s: any) =>
                        s.broadcaster_user_id === session.broadcaster_user_id &&
                        s.kick_stream_id === session.kick_stream_id &&
                        s.kick_stream_id !== null
                    )
                }

                // If no match by kick_stream_id, fallback to started_at window
                if (existingIndex === -1) {
                    existingIndex = acc.findIndex((s: any) =>
                        s.broadcaster_user_id === session.broadcaster_user_id &&
                        Math.abs(s.started_at.getTime() - session.started_at.getTime()) < 60000 // Within 1 minute
                    )
                }

                if (existingIndex === -1) {
                    acc.push(session)
                } else {
                    // Keep the session with the LONGEST duration (the real stream, not a phantom)
                    const existing = acc[existingIndex]
                    const existingDuration = existing.ended_at && existing.started_at
                        ? existing.ended_at.getTime() - existing.started_at.getTime()
                        : 0
                    const sessionDuration = session.ended_at && session.started_at
                        ? session.ended_at.getTime() - session.started_at.getTime()
                        : 0

                    // If new session is longer, replace; otherwise keep existing
                    if (sessionDuration > existingDuration) {
                        acc[existingIndex] = session
                    }
                    // If durations are equal, prefer the one with more messages or kick_stream_id
                    else if (sessionDuration === existingDuration) {
                        const sessionScore = (session.total_messages || 0) + (session.kick_stream_id ? 1000 : 0)
                        const existingScore = (existing.total_messages || 0) + (existing.kick_stream_id ? 1000 : 0)
                        if (sessionScore > existingScore) {
                            acc[existingIndex] = session
                        }
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
            const prisma = db as any
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

                        const updateData: StreamSessionUpdateData = {
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

                        // FIX: Update ended_at and duration_seconds from Kick video's actual duration
                        // The Kick videos API provides accurate start_time + duration data
                        if (best.startTime && best.durationMs && best.durationMs > 0) {
                            const calculatedEndTime = new Date(best.startTime.getTime() + best.durationMs)
                            const currentEndedAt = session.ended_at instanceof Date
                                ? session.ended_at
                                : (session.ended_at ? new Date(session.ended_at) : null)

                            // Only update if end times differ by more than 1 minute
                            // This fixes cases where our internal tracking detected offline late
                            if (currentEndedAt && Math.abs(calculatedEndTime.getTime() - currentEndedAt.getTime()) > 60000) {
                                updateData.ended_at = calculatedEndTime
                                updateData.duration_seconds = Math.floor(best.durationMs / 1000)
                                changed = true
                                console.log(`[Stream Sessions] Correcting ended_at for session ${session.id}: ${currentEndedAt.toISOString()} -> ${calculatedEndTime.toISOString()} (from Kick video duration)`)
                            }

                            // Also update started_at if Kick's start time is more accurate
                            const currentStartedAt = session.started_at instanceof Date
                                ? session.started_at
                                : new Date(session.started_at)
                            if (Math.abs(best.startTime.getTime() - currentStartedAt.getTime()) > 60000) {
                                updateData.started_at = best.startTime
                                // Recalculate duration with correct start time
                                if (updateData.ended_at) {
                                    updateData.duration_seconds = Math.floor(best.durationMs / 1000)
                                }
                                changed = true
                                console.log(`[Stream Sessions] Correcting started_at for session ${session.id}: ${currentStartedAt.toISOString()} -> ${best.startTime.toISOString()} (from Kick video)`)
                            }
                        }

                        if (changed) {
                            const updated = await prisma.streamSession.update({
                                where: { id: session.id },
                                data: updateData,
                            })
                            // Keep response in sync without a re-query
                            session.thumbnail_url = updated.thumbnail_url
                            session.kick_stream_id = updated.kick_stream_id
                            session.session_title = updated.session_title
                            session.thumbnail_last_refreshed_at = updated.thumbnail_last_refreshed_at
                            session.thumbnail_source = updated.thumbnail_source
                            // Also sync corrected times from Kick video data
                            if (updated.started_at) session.started_at = updated.started_at
                            if (updated.ended_at) session.ended_at = updated.ended_at
                            if (updated.duration_seconds !== null) session.duration_seconds = updated.duration_seconds
                        }
                    }
                }
            }
        } catch (e) {
            // Non-fatal: Past Streams should still render even if Kick blocks /videos temporarily.
        }

        // Calculate duration for completed streams with null safety
        const sessionsWithDuration = (paginatedSessions as any[]).map((session: any) => {
            let duration: number | null = null
            if (session.ended_at && session.started_at) {
                try {
                    const prisma = db as any
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
    // Legacy endpoint disabled - sessions are created automatically by /api/channel live tracking
    // Test sessions should use /api/admin/test-session instead
    console.warn('[stream-sessions] ⚠️ Legacy POST endpoint called - sessions are created automatically via /api/channel')

    return NextResponse.json(
        {
            error: 'Method Not Allowed',
            message: 'Stream sessions are created automatically when streams go live via /api/channel polling. For test sessions, use /api/admin/test-session instead.',
            deprecated: true,
        },
        { status: 405 }
    )
}

export async function PATCH(request: Request) {
    // Legacy endpoint disabled - sessions are managed automatically by /api/channel live tracking
    // Session metadata updates happen via stream-session-manager.ts
    console.warn('[stream-sessions] ⚠️ Legacy PATCH endpoint called - sessions are managed automatically via /api/channel')

    return NextResponse.json(
        {
            error: 'Method Not Allowed',
            message: 'Stream sessions are managed automatically when streams go live/offline via /api/channel polling. Session updates happen through the centralized stream-session-manager.',
            deprecated: true,
        },
        { status: 405 }
    )
}

export async function DELETE(request: Request) {
    try {
        const prisma = db as any
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
            const prisma = db as any
            sessionIdBigInt = BigInt(sessionId)
        } catch (error) {
            return NextResponse.json(
                { error: 'Invalid session_id format' },
                { status: 400 }
            )
        }

        // Check if session exists and get its details for duplicate detection
        const session = await prisma.streamSession.findUnique({
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
        const duplicateSessions = await prisma.streamSession.findMany({
            where: {
                broadcaster_user_id: session.broadcaster_user_id,
                started_at: {
                    gte: new Date(session.started_at.getTime() - timeWindow),
                    lte: new Date(session.started_at.getTime() + timeWindow),
                },
            },
            select: { id: true },
        })

        const allSessionIds = (duplicateSessions as any[]).map((s: any) => s.id)
        const deletedCount = allSessionIds.length

        console.log(`[DELETE] Deleting ${deletedCount} session(s) (primary: ${sessionIdBigInt}, duplicates: ${allSessionIds.filter((id: any) => id !== sessionIdBigInt).map((id: any) => id.toString()).join(', ') || 'none'})`)

        // Delete related records first (chat messages, Sweet Coins history, jobs)
        // This prevents foreign key constraint errors
        try {
            const prisma = db as any
            for (const sid of allSessionIds) {
                // Delete chat messages associated with this session
                await prisma.chatMessage.deleteMany({
                    where: { stream_session_id: sid },
                })

                // Delete Sweet Coins history associated with this session
                await prisma.sweetCoinHistory.deleteMany({
                    where: { stream_session_id: sid },
                })

                // Delete Sweet Coins award jobs associated with this session
                await prisma.sweetCoinAwardJob.deleteMany({
                    where: { stream_session_id: sid },
                })

                // Delete chat jobs associated with this session
                await prisma.chatJob.deleteMany({
                    where: { stream_session_id: sid },
                })

                // Delete the session itself
                await prisma.streamSession.delete({
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
