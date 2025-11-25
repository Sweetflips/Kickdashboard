import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { isAdmin } from '@/lib/auth'

/**
 * POST /api/admin/fetch-thumbnails
 * Fetch thumbnails for past streams that don't have them
 * Uses Kick's video API to match streams with videos and get thumbnails
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
        const limit = parseInt(searchParams.get('limit') || '50', 10)

        // Find past streams without thumbnails
        const sessionsWithoutThumbnails = await db.streamSession.findMany({
            where: {
                channel_slug: slug,
                ended_at: { not: null }, // Only past streams
                thumbnail_url: null, // Missing thumbnails
            },
            orderBy: { started_at: 'desc' },
            take: limit,
            select: {
                id: true,
                channel_slug: true,
                started_at: true,
                ended_at: true,
                session_title: true,
            },
        })

        if (sessionsWithoutThumbnails.length === 0) {
            return NextResponse.json({
                success: true,
                message: 'No streams found without thumbnails',
                stats: {
                    processed: 0,
                    matched: 0,
                    updated: 0,
                    errors: 0,
                },
            })
        }

        console.log(`[Fetch Thumbnails] Found ${sessionsWithoutThumbnails.length} streams without thumbnails for ${slug}`)

        // Fetch videos from Kick API
        let videos: any[] = []
        try {
            // Try legacy endpoint first (may be blocked)
            const response = await fetch(`https://kick.com/api/v2/channels/${slug}/videos`, {
                headers: {
                    'Accept': 'application/json',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                },
            })

            if (response.ok) {
                videos = await response.json()
                console.log(`[Fetch Thumbnails] Found ${videos.length} videos from Kick API`)
            } else if (response.status === 403) {
                console.warn(`[Fetch Thumbnails] Legacy API blocked (403) for ${slug}`)
                return NextResponse.json({
                    success: false,
                    message: 'Kick API endpoint blocked. Please use the sync-streams endpoint with manual video data.',
                    stats: {
                        processed: 0,
                        matched: 0,
                        updated: 0,
                        errors: 0,
                    },
                })
            } else {
                throw new Error(`Kick API returned ${response.status}`)
            }
        } catch (fetchError) {
            const errorMsg = fetchError instanceof Error ? fetchError.message : String(fetchError)
            console.error(`[Fetch Thumbnails] Failed to fetch videos:`, errorMsg)
            return NextResponse.json({
                success: false,
                error: 'Failed to fetch videos from Kick API',
                details: errorMsg,
                stats: {
                    processed: 0,
                    matched: 0,
                    updated: 0,
                    errors: 0,
                },
            }, { status: 500 })
        }

        const stats = {
            processed: 0,
            matched: 0,
            updated: 0,
            errors: 0,
        }

        // Match videos to sessions and update thumbnails
        for (const session of sessionsWithoutThumbnails) {
            stats.processed++

            try {
                // Find matching video by start time (within 30 minutes)
                const timeWindow = 30 * 60 * 1000 // 30 minutes
                const matchingVideo = videos.find((video) => {
                    const videoStartedAt = new Date(video.start_time || video.created_at)
                    const timeDiff = Math.abs(videoStartedAt.getTime() - session.started_at.getTime())
                    return timeDiff <= timeWindow
                })

                if (matchingVideo) {
                    // Extract thumbnail URL
                    let thumbnailUrl: string | null = null
                    if (matchingVideo.thumbnail) {
                        if (typeof matchingVideo.thumbnail === 'string') {
                            thumbnailUrl = matchingVideo.thumbnail
                        } else if (typeof matchingVideo.thumbnail === 'object' && matchingVideo.thumbnail.url) {
                            thumbnailUrl = matchingVideo.thumbnail.url
                        }
                    }

                    if (thumbnailUrl) {
                        await db.streamSession.update({
                            where: { id: session.id },
                            data: { thumbnail_url: thumbnailUrl },
                        })
                        stats.matched++
                        stats.updated++
                        console.log(`[Fetch Thumbnails] Updated thumbnail for session ${session.id}`)
                    } else {
                        console.log(`[Fetch Thumbnails] Video ${matchingVideo.id} has no thumbnail`)
                    }
                } else {
                    console.log(`[Fetch Thumbnails] No matching video found for session ${session.id} (started: ${session.started_at.toISOString()})`)
                }
            } catch (err) {
                console.error(`[Fetch Thumbnails] Error processing session ${session.id}:`, err)
                stats.errors++
            }
        }

        return NextResponse.json({
            success: true,
            message: `Processed ${stats.processed} streams, matched ${stats.matched}, updated ${stats.updated}`,
            stats,
        })
    } catch (error) {
        console.error('[Fetch Thumbnails] Error:', error)
        return NextResponse.json(
            {
                error: 'Failed to fetch thumbnails',
                details: error instanceof Error ? error.message : 'Unknown error',
            },
            { status: 500 }
        )
    }
}

