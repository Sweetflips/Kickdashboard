import { isAdmin } from '@/lib/auth'
import { db } from '@/lib/db'
import { getChannelWithLivestream } from '@/lib/kick-api'
import { NextResponse } from 'next/server'

/**
 * POST /api/admin/fetch-stream-thumbnail
 * Fetch and update thumbnail for a specific stream session
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
        const { sessionId } = body

        if (!sessionId) {
            return NextResponse.json(
                { error: 'sessionId is required' },
                { status: 400 }
            )
        }

        // Get the session
        const session = await db.streamSession.findUnique({
            where: { id: BigInt(sessionId) },
            select: {
                id: true,
                channel_slug: true,
                broadcaster_user_id: true,
                thumbnail_url: true,
                ended_at: true,
                kick_video_id: true,
                kick_stream_id: true,
            },
        })

        if (!session) {
            return NextResponse.json(
                { error: 'Stream session not found' },
                { status: 404 }
            )
        }

        let thumbnailUrl: string | null = null
        let streamData: { streamId: string; thumbnailUrl: string | null } | null = null

        // If stream has ended, try to use VOD thumbnail
        if (session.ended_at) {
            // For ended streams, use VOD thumbnail if kick_video_id is available
            if (session.kick_video_id) {
                thumbnailUrl = `https://videos.kick.com/video/${session.kick_video_id}/thumbnails/thumbnail.jpeg`
            } else if (session.thumbnail_url) {
                // Preserve existing thumbnail if no VOD ID
                thumbnailUrl = session.thumbnail_url
            } else {
                return NextResponse.json(
                    { error: 'Cannot fetch thumbnail for ended stream - no kick_video_id available. Please sync from Kick or manually set the thumbnail.' },
                    { status: 404 }
                )
            }
        } else {
            // Stream is live - fetch from Kick API
            if (!session.channel_slug) {
                return NextResponse.json(
                    { error: 'Stream session has no channel slug' },
                    { status: 400 }
                )
            }

            // Fetch channel data from Kick API to get thumbnail
            streamData = await getChannelWithLivestream(session.channel_slug)

            if (!streamData) {
                return NextResponse.json(
                    { error: 'Failed to fetch stream data from Kick API - stream may not be live' },
                    { status: 500 }
                )
            }

            thumbnailUrl = streamData.thumbnailUrl

            if (!thumbnailUrl) {
                return NextResponse.json(
                    { error: 'No thumbnail found for this live stream' },
                    { status: 404 }
                )
            }
        }

        // Update the session with thumbnail
        const updateData: { thumbnail_url: string; kick_stream_id?: string } = {
            thumbnail_url: thumbnailUrl,
        }

        // If stream is live and we got stream data, also update kick_stream_id
        if (!session.ended_at && streamData?.streamId) {
            updateData.kick_stream_id = streamData.streamId
        }

        const updatedSession = await db.streamSession.update({
            where: { id: session.id },
            data: updateData,
        })

        return NextResponse.json({
            success: true,
            thumbnail_url: thumbnailUrl,
            message: 'Thumbnail updated successfully',
        })
    } catch (error) {
        console.error('Fetch thumbnail error:', error)
        return NextResponse.json(
            {
                error: 'Failed to fetch thumbnail',
                details: error instanceof Error ? error.message : 'Unknown error',
            },
            { status: 500 }
        )
    }
}
