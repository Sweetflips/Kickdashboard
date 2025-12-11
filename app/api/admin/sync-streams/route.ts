import { db } from '@/lib/db'
import { getChannelWithLivestream } from '@/lib/kick-api'
import { getActiveSession, updateSessionMetadata, findSessionByStartTime } from '@/lib/stream-session-manager'
import { Prisma } from '@prisma/client'
import { NextResponse } from 'next/server'

/**
 * POST /api/admin/sync-streams
 *
 * Syncs stream thumbnails and metadata from Kick API.
 * NOTE: This route does NOT create sessions - sessions are only created
 * by the channel API when it detects a stream going live.
 *
 * This route only:
 * 1. Updates thumbnails for existing active sessions
 * 2. Matches historical video data with existing sessions
 */
export async function POST(request: Request) {
    try {
        const { searchParams } = new URL(request.url)
        const slug = searchParams.get('slug') || 'sweetflips'

        let videos: any[] = []
        let liveStreamUpdated = false
        let liveStreamError: string | null = null

        // Try to parse body for provided videos (manual sync fallback)
        try {
            const body = await request.json()
            if (body && Array.isArray(body.videos)) {
                videos = body.videos
                console.log(`Received ${videos.length} videos from request body`)
            }
        } catch (e) {
            // Body might be empty if we're just triggering the fetch
        }

        // If no videos provided, try to fetch from official Kick Dev API
        if (videos.length === 0) {
            console.log(`[Sync] Starting sync for channel: ${slug}`)

            try {
                console.log(`[Sync] Fetching thumbnail from Kick Dev API for channel: ${slug}`)
                const livestreamData = await getChannelWithLivestream(slug)

                if (livestreamData && livestreamData.thumbnailUrl) {
                    console.log(`[Sync] Got thumbnail from Kick Dev API for ${slug}`)

                    // Get broadcaster_user_id from database using slug
                    const broadcaster = await db.user.findFirst({
                        where: {
                            username: {
                                equals: slug,
                                mode: 'insensitive',
                            },
                        },
                        select: {
                            kick_user_id: true,
                        },
                    })

                    if (!broadcaster || !broadcaster.kick_user_id) {
                        console.warn(`[Sync] Could not find broadcaster_user_id for channel ${slug}`)
                        liveStreamError = 'Broadcaster not found in database'
                    } else {
                        const broadcasterUserId = BigInt(broadcaster.kick_user_id)

                        // Find active session for this channel (DO NOT CREATE)
                        const activeSession = await getActiveSession(broadcasterUserId)

                        if (activeSession) {
                            // Update existing session's thumbnail
                            const updated = await updateSessionMetadata(activeSession.id, {
                                thumbnailUrl: livestreamData.thumbnailUrl,
                                kickStreamId: livestreamData.streamId || null,
                            })

                            if (updated) {
                                console.log(`[Sync] Updated thumbnail for active session ${activeSession.id}`)
                                liveStreamUpdated = true
                            }
                        } else {
                            // No active session - this is expected if stream is not live
                            // The channel API polling will create a session when the stream goes live
                            console.log(`[Sync] No active session for ${slug} - stream may not be live`)
                            liveStreamError = 'No active session found. Sessions are created automatically when streams go live.'
                        }
                    }
                } else {
                    console.log(`[Sync] No livestream data or thumbnail found for channel ${slug}`)
                    liveStreamError = 'Channel is not currently live'
                }
            } catch (apiError) {
                const errorMsg = apiError instanceof Error ? apiError.message : String(apiError)
                console.warn(`[Sync] Failed to fetch from Kick Dev API for ${slug}:`, errorMsg)
                if (errorMsg.includes('KICK_CLIENT_ID') || errorMsg.includes('KICK_CLIENT_SECRET')) {
                    liveStreamError = 'Kick API credentials not configured'
                } else {
                    liveStreamError = errorMsg
                }
            }

            console.log(`[Sync] Skipping legacy API - endpoint is blocked by Kick`)
        }

        const stats = {
            processed: 0,
            matched: 0,
            updated: 0,
            errors: 0
        }

        // Process manually provided videos (for historical matching)
        for (const video of videos) {
            stats.processed++

            try {
                // Extract video data
                const videoStartedAt = new Date(video.start_time || video.created_at)
                const videoDuration = video.duration // usually in milliseconds

                // Calculate end time
                const videoEndedAt = new Date(videoStartedAt.getTime() + videoDuration)

                // Get thumbnail URL
                let thumbnailUrl = null
                if (video.thumbnail) {
                    if (typeof video.thumbnail === 'string') {
                        thumbnailUrl = video.thumbnail
                    } else if (typeof video.thumbnail === 'object' && video.thumbnail.url) {
                        thumbnailUrl = video.thumbnail.url
                    }
                }

                // Find matching session in DB by start time
                const timeWindow = 30 * 60 * 1000 // 30 minutes

                const matchingSession = await db.streamSession.findFirst({
                    where: {
                        channel_slug: slug,
                        started_at: {
                            gte: new Date(videoStartedAt.getTime() - timeWindow),
                            lte: new Date(videoStartedAt.getTime() + timeWindow)
                        }
                    }
                })

                if (matchingSession) {
                    stats.matched++

                    // Prepare update data
                    const updateData: Prisma.StreamSessionUpdateInput = {}
                    let needsUpdate = false

                    // Update thumbnail if missing or different
                    if (thumbnailUrl && matchingSession.thumbnail_url !== thumbnailUrl) {
                        updateData.thumbnail_url = thumbnailUrl
                        needsUpdate = true
                    }

                    // Update title if missing
                    if (video.title && (!matchingSession.session_title || matchingSession.session_title === 'Untitled Stream')) {
                        updateData.session_title = video.title
                        needsUpdate = true
                    }

                    // Update ended_at if missing
                    if (!matchingSession.ended_at && videoEndedAt) {
                        updateData.ended_at = videoEndedAt
                        needsUpdate = true
                    }

                    if (needsUpdate) {
                        await db.streamSession.update({
                            where: { id: matchingSession.id },
                            data: updateData
                        })
                        stats.updated++
                        console.log(`[Sync] Updated session ${matchingSession.id} with data from video ${video.id}`)
                    }
                } else {
                    console.log(`[Sync] No matching session found for video ${video.id} (${video.title}) started at ${videoStartedAt.toISOString()}`)
                }

            } catch (err) {
                console.error(`[Sync] Error processing video ${video.id}:`, err)
                stats.errors++
            }
        }

        // Determine success status
        const hasErrors = stats.errors > 0
        const hasUpdates = stats.updated > 0 || stats.matched > 0 || liveStreamUpdated

        // Build appropriate message
        let message = ''
        if (videos.length > 0) {
            message = hasUpdates
                ? `Synced ${stats.updated} streams from provided video data`
                : 'No updates needed from provided video data'
        } else if (liveStreamUpdated) {
            message = 'Successfully updated live stream thumbnail'
        } else if (liveStreamError) {
            message = `Live stream sync: ${liveStreamError}`
        } else {
            message = 'No updates made. Thumbnails are captured automatically when streams go live.'
        }

        return NextResponse.json({
            success: !hasErrors || hasUpdates,
            message,
            stats: {
                ...stats,
                liveStreamUpdated: liveStreamUpdated ? 1 : 0,
            },
            note: !liveStreamUpdated && videos.length === 0
                ? 'Sessions are created automatically when streams go live via the channel API. This sync only updates thumbnails for existing sessions.'
                : undefined
        })

    } catch (error) {
        console.error('[Sync] Error:', error)
        return NextResponse.json(
            { error: 'Failed to sync streams', details: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        )
    }
}
