import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { getChannelWithLivestream } from '@/lib/kick-api'

export async function POST(request: Request) {
    try {
        const { searchParams } = new URL(request.url)
        const slug = searchParams.get('slug') || 'sweetflips'

        let videos: any[] = []

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
            console.log(`Starting server-side sync for channel: ${slug}`)

            // First, try to get current livestream thumbnail from official Kick Dev API
            try {
                console.log(`[Sync] Attempting to fetch thumbnail from Kick Dev API for channel: ${slug}`)
                const livestreamData = await getChannelWithLivestream(slug)

                if (livestreamData && livestreamData.thumbnailUrl) {
                    console.log(`[Sync] Successfully fetched thumbnail from Kick Dev API for ${slug}`)
                    // Find active session for this channel
                    const activeSession = await db.streamSession.findFirst({
                        where: {
                            channel_slug: slug,
                            ended_at: null, // Active session
                        },
                        orderBy: { started_at: 'desc' },
                    })

                    if (activeSession) {
                        // Update thumbnail if different
                        if (activeSession.thumbnail_url !== livestreamData.thumbnailUrl) {
                            await db.streamSession.update({
                                where: { id: activeSession.id },
                                data: { thumbnail_url: livestreamData.thumbnailUrl },
                            })
                            console.log(`[Sync] Updated thumbnail for active session ${activeSession.id}`)
                        } else {
                            console.log(`[Sync] Thumbnail already up to date for session ${activeSession.id}`)
                        }
                    } else {
                        console.log(`[Sync] No active session found for channel ${slug}`)
                    }
                } else {
                    console.log(`[Sync] No livestream data or thumbnail found for channel ${slug}`)
                }
            } catch (apiError) {
                const errorMsg = apiError instanceof Error ? apiError.message : String(apiError)
                console.warn(`[Sync] Failed to fetch from Kick Dev API for ${slug}:`, errorMsg)
                // Check if it's a configuration error
                if (errorMsg.includes('KICK_CLIENT_ID') || errorMsg.includes('KICK_CLIENT_SECRET')) {
                    console.warn(`[Sync] Kick Dev API credentials not configured. Set KICK_CLIENT_ID and KICK_CLIENT_SECRET environment variables to use official API.`)
                }
            }

            // Fallback to legacy endpoint for historical videos (may be blocked)
            // Note: This endpoint is unofficial and may return 403
            try {
                console.log(`[Sync] Attempting to fetch historical videos from legacy endpoint for ${slug}`)
                const response = await fetch(`https://kick.com/api/v2/channels/${slug}/videos`, {
                    headers: {
                        'Accept': 'application/json',
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                    },
                    next: { revalidate: 0 } // Don't cache
                })

                if (!response.ok) {
                    if (response.status === 403) {
                        console.warn(`[Sync] Legacy API endpoint blocked (403) for ${slug}. This is expected - use Kick Dev API for thumbnails.`)
                        // Don't throw - allow sync to complete without videos
                        videos = []
                    } else {
                        throw new Error(`Kick API returned ${response.status}`)
                    }
                } else {
                    videos = await response.json()
                    console.log(`[Sync] Found ${videos.length} videos from legacy Kick API`)
                }
            } catch (fetchError) {
                const errorMsg = fetchError instanceof Error ? fetchError.message : String(fetchError)
                console.warn(`[Sync] Legacy endpoint fetch failed for ${slug}:`, errorMsg)
                // Don't throw - allow sync to complete gracefully
                videos = []
            }
        }

        const stats = {
            processed: 0,
            matched: 0,
            updated: 0,
            errors: 0
        }

        // 2. Iterate and match with local DB
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

                // Find matching session in DB
                // We look for a session started within 30 minutes of the video start time
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
                        console.log(`Updated session ${matchingSession.id} with data from video ${video.id}`)
                    }
                } else {
                    console.log(`No matching session found for video ${video.id} (${video.title}) started at ${videoStartedAt.toISOString()}`)
                }

            } catch (err) {
                console.error(`Error processing video ${video.id}:`, err)
                stats.errors++
            }
        }

        // Determine success status
        const hasErrors = stats.errors > 0
        const hasUpdates = stats.updated > 0 || stats.matched > 0

        return NextResponse.json({
            success: !hasErrors || hasUpdates, // Success if we updated something or had no errors
            message: hasUpdates
                ? 'Sync completed successfully'
                : videos.length === 0
                    ? 'No videos found to sync. Legacy API may be blocked - use Kick Dev API for thumbnails.'
                    : 'Sync completed with no updates needed',
            stats,
            note: videos.length === 0
                ? 'Tip: Set KICK_CLIENT_ID and KICK_CLIENT_SECRET environment variables to use the official Kick Dev API for fetching thumbnails.'
                : undefined
        })

    } catch (error) {
        console.error('Sync error:', error)
        return NextResponse.json(
            { error: 'Failed to sync streams', details: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        )
    }
}
