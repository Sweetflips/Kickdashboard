import { db } from '@/lib/db'
import { getChannelWithLivestream } from '@/lib/kick-api'
import { getActiveSession, updateSessionMetadata, findSessionByStartTime, mergeLikelyDuplicateSessions } from '@/lib/stream-session-manager'
import { Prisma } from '@prisma/client'
import { NextResponse } from 'next/server'
import { fetchKickV2ChannelVideos } from '@/lib/kick-videos'
import { isAdmin } from '@/lib/auth'

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
        // Check admin access
        const adminCheck = await isAdmin(request)
        if (!adminCheck) {
            return NextResponse.json(
                { error: 'Unauthorized - Admin access required' },
                { status: 403 }
            )
        }

        const { searchParams } = new URL(request.url)
        const slug = searchParams.get('slug') || 'sweetflips'
        const limit = Math.max(1, Math.min(200, parseInt(searchParams.get('limit') || '30', 10) || 30))
        const forceFromQuery = searchParams.get('force')
        let force = forceFromQuery === '1' || forceFromQuery === 'true'

        let videos: any[] = []
        let liveStreamUpdated = false
        let liveStreamError: string | null = null

        const parseKickTimestamp = (input: any): Date | null => {
            if (!input) return null
            if (input instanceof Date) return isNaN(input.getTime()) ? null : input

            const raw = String(input).trim()
            if (!raw) return null

            // ISO (with timezone)
            if (raw.includes('T') && (raw.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(raw))) {
                const d = new Date(raw)
                return isNaN(d.getTime()) ? null : d
            }

            // Kick often returns "YYYY-MM-DD HH:mm:ss" (no timezone). Treat as UTC.
            if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(raw)) {
                const d = new Date(raw.replace(' ', 'T') + 'Z')
                return isNaN(d.getTime()) ? null : d
            }

            // Fallback: let Date try
            const d = new Date(raw)
            return isNaN(d.getTime()) ? null : d
        }

        const getVideoTitle = (video: any): string | null => {
            // Kick /api/v2/channels/:slug/videos uses session_title, not title
            if (typeof video?.title === 'string' && video.title.trim()) return video.title.trim()
            if (typeof video?.session_title === 'string' && video.session_title.trim()) return video.session_title.trim()
            // Some payloads may embed title under video.title
            if (typeof video?.video?.title === 'string' && video.video.title.trim()) return video.video.title.trim()
            return null
        }

        const getVideoThumbnailUrl = (video: any): string | null => {
            // Prefer normalized shape if present (e.g. { thumbnail: { url } } or { thumbnail: "..." })
            const thumb = video?.thumbnail
            if (typeof thumb === 'string' && thumb.trim()) return thumb.trim()
            if (thumb && typeof thumb === 'object') {
                if (typeof thumb.url === 'string' && thumb.url.trim()) return thumb.url.trim()
                // Kick /videos returns { thumbnail: { src, srcset } }
                if (typeof thumb.src === 'string' && thumb.src.trim()) return thumb.src.trim()
            }
            // Some payloads may include thumb under video.thumb
            if (typeof video?.thumb === 'string' && video.thumb.trim()) return video.thumb.trim()
            return null
        }

        const getKickVodVideoId = (video: any): string | null => {
            // Kick /videos payload often includes nested video.id (VOD video id)
            const raw = video?.video?.id ?? video?.kick_video_id ?? video?.kickVideoId
            if (raw === null || raw === undefined) return null
            const str = String(raw).trim()
            return str ? str : null
        }

        // Try to parse body for provided videos (manual sync fallback)
        try {
            const body = await request.json()
            if (body && Array.isArray(body.videos)) {
                videos = body.videos
                console.log(`Received ${videos.length} videos from request body`)
            }
            if (body && typeof body.force === 'boolean') {
                force = body.force
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

        // If still no videos provided, fetch from Kick v2 /videos endpoint server-side (best-effort).
        // This is what the admin UI suggests pasting manually; when it works server-side, we can auto-sync.
        if (videos.length === 0) {
            try {
                const v2Videos = await fetchKickV2ChannelVideos(slug, 2 * 60 * 1000)
                // Convert normalized shape back to a "video-like" object for the existing matcher below.
                // We keep the fields it reads: start_time, created_at, duration, thumbnail, session_title/title, video.id
                videos = v2Videos
                    .filter(v => v.startTime)
                    .map(v => ({
                        id: v.id,
                        start_time: v.startTime ? v.startTime.toISOString() : null,
                        created_at: v.startTime ? v.startTime.toISOString() : null,
                        duration: v.durationMs || 0,
                        thumbnail: v.thumbnailUrl ? { src: v.thumbnailUrl } : null,
                        session_title: v.title,
                        title: v.title,
                        video: v.vodId ? { id: v.vodId, title: v.title } : undefined,
                    }))

                if (videos.length > 0) {
                    console.log(`[Sync] Fetched ${videos.length} video(s) from Kick v2 /videos for ${slug}`)
                }
            } catch (e) {
                // ignore - will fall through to no-op sync result
            }
        }

        const stats = {
            processed: 0,
            matched: 0,
            updated: 0,
            errors: 0
        }

        const debug = {
            unmatched: [] as Array<{ videoId: string; startedAt: string; title: string | null }>,
            matchedNoChange: [] as Array<{ videoId: string; sessionId: string }>,
            updatedPairs: [] as Array<{ videoId: string; sessionId: string }>,
        }

        // Only process the most recent N videos (prevents accidental updates far back in history)
        if (videos.length > limit) {
            videos = [...videos]
                .sort((a, b) => {
                    const aDate = parseKickTimestamp(a?.start_time || a?.created_at)
                    const bDate = parseKickTimestamp(b?.start_time || b?.created_at)
                    const aTime = aDate ? aDate.getTime() : 0
                    const bTime = bDate ? bDate.getTime() : 0
                    return bTime - aTime
                })
                .slice(0, limit)
            console.log(`[Sync] Limiting manual sync to ${limit} most recent videos`)
        }

        // Process manually provided videos (for historical matching)
        for (const video of videos) {
            stats.processed++

            try {
                // Extract video data
                const videoStartedAt = parseKickTimestamp(video.start_time || video.created_at)
                if (!videoStartedAt) {
                    stats.errors++
                    debug.unmatched.push({
                        videoId: String(video?.id ?? ''),
                        startedAt: String(video?.start_time || video?.created_at || ''),
                        title: getVideoTitle(video),
                    })
                    console.log(`[Sync] Skipping video ${video?.id} due to invalid start_time/created_at`)
                    continue
                }
                const videoDuration = video.duration // usually in milliseconds

                // Calculate end time
                const videoEndedAt = new Date(videoStartedAt.getTime() + videoDuration)

                // Get thumbnail URL
                const thumbnailUrl = getVideoThumbnailUrl(video)
                const videoTitle = getVideoTitle(video)
                const kickVodVideoId = getKickVodVideoId(video)

                // Find matching session in DB by start time
                const timeWindow = 30 * 60 * 1000 // 30 minutes

                const findCandidates = async (windowMs: number) => {
                    return await db.streamSession.findMany({
                        where: {
                            channel_slug: slug,
                            started_at: {
                                gte: new Date(videoStartedAt.getTime() - windowMs),
                                lte: new Date(videoStartedAt.getTime() + windowMs)
                            }
                        },
                        orderBy: { started_at: 'desc' },
                    })
                }

                let candidateSessions = await findCandidates(timeWindow)
                // If nothing matched, widen window in force mode (handles timezone drift / slight offsets)
                if (candidateSessions.length === 0 && force) {
                    const extendedWindow = 6 * 60 * 60 * 1000 // 6 hours
                    candidateSessions = await findCandidates(extendedWindow)
                }

                const matchingSession = candidateSessions
                    .filter(s => !s.session_title?.startsWith('[TEST]'))
                    .sort((a, b) => {
                        const aDiff = Math.abs(a.started_at.getTime() - videoStartedAt.getTime())
                        const bDiff = Math.abs(b.started_at.getTime() - videoStartedAt.getTime())

                        // Prefer sessions missing thumbnail/kick id when diffs are close
                        const aNeeds = (a.thumbnail_url ? 0 : 1) + (a.kick_stream_id ? 0 : 1)
                        const bNeeds = (b.thumbnail_url ? 0 : 1) + (b.kick_stream_id ? 0 : 1)

                        // Within 2 minutes, prioritize "needs data" over absolute time diff
                        const closeWindow = 2 * 60 * 1000
                        if (Math.abs(aDiff - bDiff) <= closeWindow && aNeeds !== bNeeds) {
                            return bNeeds - aNeeds
                        }
                        return aDiff - bDiff
                    })[0]

                if (matchingSession) {
                    stats.matched++

                    // Prepare update data
                    const updateData: Prisma.StreamSessionUpdateInput = {}
                    let needsUpdate = false

                    // Update thumbnail if missing or different
                    if (thumbnailUrl && matchingSession.thumbnail_url !== thumbnailUrl) {
                        updateData.thumbnail_url = thumbnailUrl
                        updateData.thumbnail_captured_at = new Date()
                        updateData.thumbnail_source = 'kick_vod'
                        needsUpdate = true
                    }

                    // Update title
                    if (videoTitle) {
                        const currentTitle = matchingSession.session_title || ''
                        const shouldUpdateTitle = force
                            ? currentTitle.trim() !== videoTitle
                            : (!matchingSession.session_title || matchingSession.session_title === 'Untitled Stream')

                        if (shouldUpdateTitle) {
                            updateData.session_title = videoTitle
                            needsUpdate = true
                        }
                    }

                    // Store Kick VOD video id for future thumbnail fetching (schema says this is VOD id)
                    if (kickVodVideoId && matchingSession.kick_stream_id !== kickVodVideoId) {
                        updateData.kick_stream_id = kickVodVideoId
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
                        debug.updatedPairs.push({ videoId: String(video?.id ?? ''), sessionId: String(matchingSession.id) })
                        console.log(`[Sync] Updated session ${matchingSession.id} with data from video ${video.id}`)

                        // If this update ended a session (or enriched it right after end), attempt to merge accidental duplicates.
                        // This is the main place duplicates can persist, since sync updates ended_at directly (not via endSession()).
                        try {
                            await mergeLikelyDuplicateSessions(matchingSession.id)
                        } catch {
                            // non-fatal
                        }
                    } else {
                        debug.matchedNoChange.push({ videoId: String(video?.id ?? ''), sessionId: String(matchingSession.id) })
                    }
                } else {
                    debug.unmatched.push({
                        videoId: String(video?.id ?? ''),
                        startedAt: videoStartedAt.toISOString(),
                        title: videoTitle,
                    })
                    console.log(`[Sync] No matching session found for video ${video.id} (${videoTitle || 'Untitled'}) started at ${videoStartedAt.toISOString()}`)
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
            debug: videos.length > 0 ? { ...debug, force } : undefined,
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
