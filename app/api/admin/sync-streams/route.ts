import { db } from '@/lib/db'
import { getChannelWithLivestream } from '@/lib/kick-api'
import { Prisma } from '@prisma/client'
import { NextResponse } from 'next/server'

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
            console.log(`Starting server-side sync for channel: ${slug}`)

            // First, try to get current livestream thumbnail from official Kick Dev API
            try {
                console.log(`[Sync] Attempting to fetch thumbnail from Kick Dev API for channel: ${slug}`)
                const livestreamData = await getChannelWithLivestream(slug)

                if (livestreamData && livestreamData.thumbnailUrl) {
                    console.log(`[Sync] Successfully fetched thumbnail from Kick Dev API for ${slug}`)

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

                        // Find active session for this channel
                        // Use transaction with retry logic to prevent race condition when creating sessions
                        // If multiple requests run concurrently, only one will create the session
                        const maxRetries = 3
                        let retryCount = 0
                        let sessionHandled = false

                        while (retryCount < maxRetries && !sessionHandled) {
                            try {
                                await db.$transaction(async (tx) => {
                                    // Check for active session within transaction
                                    const activeSession = await tx.streamSession.findFirst({
                                        where: {
                                            broadcaster_user_id: broadcasterUserId,
                                            ended_at: null, // Active session
                                        },
                                        orderBy: { started_at: 'desc' },
                                    })

                                    if (activeSession) {
                                        // Update thumbnail and kick_stream_id if different
                                        const needsUpdate = activeSession.thumbnail_url !== livestreamData.thumbnailUrl ||
                                                          activeSession.kick_stream_id !== livestreamData.streamId
                                        if (needsUpdate) {
                                            await tx.streamSession.update({
                                                where: { id: activeSession.id },
                                                data: {
                                                    thumbnail_url: livestreamData.thumbnailUrl,
                                                    kick_stream_id: livestreamData.streamId,
                                                },
                                            })
                                            console.log(`[Sync] Updated thumbnail and kick_stream_id for active session ${activeSession.id}`)
                                            liveStreamUpdated = true
                                        } else {
                                            console.log(`[Sync] Thumbnail already up to date for session ${activeSession.id}`)
                                        }
                                        sessionHandled = true
                                    } else {
                                        // Stream is live but no session exists - create one atomically
                                        // Transaction ensures only one session is created even with concurrent requests
                                        const newSession = await tx.streamSession.create({
                                            data: {
                                                broadcaster_user_id: broadcasterUserId,
                                                channel_slug: slug,
                                                session_title: null, // Could fetch from livestreams API if needed
                                                thumbnail_url: livestreamData.thumbnailUrl,
                                                kick_stream_id: livestreamData.streamId,
                                                started_at: new Date(),
                                                peak_viewer_count: 0,
                                            },
                                        })
                                        console.log(`[Sync] Created new active session ${newSession.id} with thumbnail`)
                                        liveStreamUpdated = true
                                        sessionHandled = true
                                    }
                                }, {
                                    // Use ReadCommitted with retry on conflict
                                    isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
                                    timeout: 5000, // 5 second timeout
                                })
                            } catch (transactionError) {
                                retryCount++

                                // Handle unique constraint violation (P2002) - another request created the session
                                if (transactionError instanceof Prisma.PrismaClientKnownRequestError &&
                                    transactionError.code === 'P2002') {
                                    // Database-level unique constraint prevented duplicate - find and update existing session
                                    const existingSession = await db.streamSession.findFirst({
                                        where: {
                                            broadcaster_user_id: broadcasterUserId,
                                            ended_at: null,
                                        },
                                        orderBy: { started_at: 'desc' },
                                    })

                                    if (existingSession) {
                                        // Another request created the session - update thumbnail and kick_stream_id
                                        const needsUpdate = existingSession.thumbnail_url !== livestreamData.thumbnailUrl ||
                                                          existingSession.kick_stream_id !== livestreamData.streamId
                                        if (needsUpdate) {
                                            await db.streamSession.update({
                                                where: { id: existingSession.id },
                                                data: {
                                                    thumbnail_url: livestreamData.thumbnailUrl,
                                                    kick_stream_id: livestreamData.streamId,
                                                },
                                            })
                                            console.log(`[Sync] Unique constraint violation - updated thumbnail and kick_stream_id for session ${existingSession.id}`)
                                            liveStreamUpdated = true
                                        } else {
                                            console.log(`[Sync] Unique constraint violation - session ${existingSession.id} already has correct thumbnail`)
                                        }
                                        sessionHandled = true
                                    } else {
                                        // Should not happen, but handle gracefully
                                        console.warn(`[Sync] Unique constraint violation but no session found - retrying`)
                                        if (retryCount >= maxRetries) {
                                            throw transactionError
                                        }
                                    }
                                } else {
                                    // Other transaction errors - check if session exists and retry
                                    const existingSession = await db.streamSession.findFirst({
                                        where: {
                                            broadcaster_user_id: broadcasterUserId,
                                            ended_at: null,
                                        },
                                        orderBy: { started_at: 'desc' },
                                    })

                                    if (existingSession) {
                                        // Another request created the session - update thumbnail and kick_stream_id
                                        const needsUpdate = existingSession.thumbnail_url !== livestreamData.thumbnailUrl ||
                                                          existingSession.kick_stream_id !== livestreamData.streamId
                                        if (needsUpdate) {
                                            await db.streamSession.update({
                                                where: { id: existingSession.id },
                                                data: {
                                                    thumbnail_url: livestreamData.thumbnailUrl,
                                                    kick_stream_id: livestreamData.streamId,
                                                },
                                            })
                                            console.log(`[Sync] Race condition detected - updated thumbnail and kick_stream_id for session ${existingSession.id}`)
                                            liveStreamUpdated = true
                                        } else {
                                            console.log(`[Sync] Race condition detected - session ${existingSession.id} already has correct thumbnail`)
                                        }
                                        sessionHandled = true
                                    } else if (retryCount >= maxRetries) {
                                        // Max retries reached and no session exists - log error
                                        console.error(`[Sync] Failed to create/update session after ${maxRetries} retries:`, transactionError)
                                        throw transactionError
                                    } else {
                                        // Retry with exponential backoff
                                        const delay = Math.min(100 * Math.pow(2, retryCount - 1), 500)
                                        await new Promise(resolve => setTimeout(resolve, delay))
                                        console.log(`[Sync] Retrying session creation (attempt ${retryCount + 1}/${maxRetries})`)
                                    }
                                }
                            }
                        }
                    }
                } else {
                    console.log(`[Sync] No livestream data or thumbnail found for channel ${slug}`)
                    liveStreamError = 'Channel is not currently live'
                }
            } catch (apiError) {
                const errorMsg = apiError instanceof Error ? apiError.message : String(apiError)
                console.warn(`[Sync] Failed to fetch from Kick Dev API for ${slug}:`, errorMsg)
                // Check if it's a configuration error
                if (errorMsg.includes('KICK_CLIENT_ID') || errorMsg.includes('KICK_CLIENT_SECRET')) {
                    liveStreamError = 'Kick API credentials not configured'
                } else {
                    liveStreamError = errorMsg
                }
            }

            // Note: Legacy endpoint for historical videos is blocked by Kick
            // We no longer attempt to fetch from it as it always returns 403
            console.log(`[Sync] Skipping legacy API - endpoint is blocked by Kick`)
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
            message = `Live stream sync: ${liveStreamError}. Historical VOD sync is not available - Kick API blocks this endpoint.`
        } else {
            message = 'No updates made. Note: Kick blocks historical VOD data. Thumbnails are captured automatically when streams go live.'
        }

        return NextResponse.json({
            success: !hasErrors || hasUpdates,
            message,
            stats: {
                ...stats,
                liveStreamUpdated: liveStreamUpdated ? 1 : 0,
            },
            note: !liveStreamUpdated && videos.length === 0
                ? 'Thumbnails are captured automatically when streams are live. Historical VOD thumbnails cannot be synced due to Kick API limitations.'
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
