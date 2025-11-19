import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { Prisma } from '@prisma/client'

export async function POST(request: Request) {
    try {
        const { searchParams } = new URL(request.url)
        const slug = searchParams.get('slug') || 'sweetflips'
        
        let videos: any[] = []

        // Try to parse body for provided videos
        try {
            const body = await request.json()
            if (body && Array.isArray(body.videos)) {
                videos = body.videos
                console.log(`Received ${videos.length} videos from request body`)
            }
        } catch (e) {
            // Body might be empty if we're just triggering the fetch
        }

        // If no videos provided, try to fetch from Kick API (Server-side)
        if (videos.length === 0) {
            console.log(`Starting server-side sync for channel: ${slug}`)
            try {
                const response = await fetch(`https://kick.com/api/v2/channels/${slug}/videos`, {
                    headers: {
                        'Accept': 'application/json',
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                    },
                    next: { revalidate: 0 } // Don't cache
                })

                if (!response.ok) {
                    throw new Error(`Kick API returned ${response.status}`)
                }

                videos = await response.json()
                console.log(`Found ${videos.length} videos from Kick API (Server-side)`)
            } catch (fetchError) {
                console.error('Server-side fetch failed:', fetchError)
                if (videos.length === 0) {
                    throw fetchError // Re-throw if we have no videos source
                }
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

        return NextResponse.json({
            success: true,
            message: 'Sync completed',
            stats
        })

    } catch (error) {
        console.error('Sync error:', error)
        return NextResponse.json(
            { error: 'Failed to sync streams', details: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        )
    }
}
