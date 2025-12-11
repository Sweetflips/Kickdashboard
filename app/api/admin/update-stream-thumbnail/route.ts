import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { isAdmin } from '@/lib/auth'

/**
 * POST /api/admin/update-stream-thumbnail
 * Manually update thumbnail URL and/or Kick IDs for a stream session
 * Accepts:
 * - thumbnailUrl: Direct URL to set (for any source)
 * - kickStreamId: Kick live stream ID (from /livestreams API)
 * - kickVideoId: Kick VOD video ID (from videos endpoint) - constructs VOD thumbnail URL
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

        const body = await request.json()
        const { sessionId, thumbnailUrl, kickStreamId, kickVideoId } = body

        if (!sessionId) {
            return NextResponse.json(
                { error: 'sessionId is required' },
                { status: 400 }
            )
        }

        if (!thumbnailUrl && !kickStreamId && !kickVideoId) {
            return NextResponse.json(
                { error: 'At least one of thumbnailUrl, kickStreamId, or kickVideoId is required' },
                { status: 400 }
            )
        }

        // Get the session
        const session = await db.streamSession.findUnique({
            where: { id: BigInt(sessionId) },
            select: {
                id: true,
                channel_slug: true,
                thumbnail_url: true,
                kick_stream_id: true,
                kick_video_id: true,
            },
        })

        if (!session) {
            return NextResponse.json(
                { error: 'Stream session not found' },
                { status: 404 }
            )
        }

        // Prepare update data
        const updateData: {
            thumbnail_url?: string | null
            kick_stream_id?: string | null
            kick_video_id?: string | null
        } = {}

        // If thumbnailUrl is provided directly, use it
        if (thumbnailUrl !== undefined) {
            updateData.thumbnail_url = thumbnailUrl || null
        }

        // If kickStreamId is provided (for live streams), store it
        if (kickStreamId !== undefined) {
            updateData.kick_stream_id = kickStreamId || null
        }

        // If kickVideoId is provided (for VODs), store it and construct thumbnail URL if needed
        if (kickVideoId !== undefined) {
            updateData.kick_video_id = kickVideoId || null

            // If no direct thumbnailUrl provided but kickVideoId is, construct VOD thumbnail URL
            // Kick VOD thumbnail format: https://videos.kick.com/video/{video_id}/thumbnails/thumbnail.jpeg
            if (!thumbnailUrl && kickVideoId) {
                updateData.thumbnail_url = `https://videos.kick.com/video/${kickVideoId}/thumbnails/thumbnail.jpeg`
            }
        }

        // Update the session
        const updatedSession = await db.streamSession.update({
            where: { id: session.id },
            data: updateData,
        })

        return NextResponse.json({
            success: true,
            message: 'Stream session updated successfully',
            data: {
                id: updatedSession.id.toString(),
                thumbnail_url: updatedSession.thumbnail_url,
                kick_stream_id: updatedSession.kick_stream_id,
                kick_video_id: updatedSession.kick_video_id,
            },
        })
    } catch (error) {
        console.error('Update stream thumbnail error:', error)
        return NextResponse.json(
            {
                error: 'Failed to update stream thumbnail',
                details: error instanceof Error ? error.message : 'Unknown error',
            },
            { status: 500 }
        )
    }
}
