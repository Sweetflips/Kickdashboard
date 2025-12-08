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
            },
        })

        if (!session) {
            return NextResponse.json(
                { error: 'Stream session not found' },
                { status: 404 }
            )
        }

        if (!session.channel_slug) {
            return NextResponse.json(
                { error: 'Stream session has no channel slug' },
                { status: 400 }
            )
        }

        // Fetch channel data from Kick API to get thumbnail
        const streamData = await getChannelWithLivestream(session.channel_slug)

        if (!streamData) {
            return NextResponse.json(
                { error: 'Failed to fetch stream data from Kick API' },
                { status: 500 }
            )
        }

        const thumbnailUrl = streamData.thumbnailUrl

        if (!thumbnailUrl) {
            return NextResponse.json(
                { error: 'No thumbnail found for this stream' },
                { status: 404 }
            )
        }

        // Update the session with new thumbnail
        const updatedSession = await db.streamSession.update({
            where: { id: session.id },
            data: { thumbnail_url: thumbnailUrl },
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
