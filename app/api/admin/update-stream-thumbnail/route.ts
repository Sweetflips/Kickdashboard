import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { isAdmin } from '@/lib/auth'

/**
 * POST /api/admin/update-stream-thumbnail
 * Manually update thumbnail URL and/or kick_stream_id for a stream session
 * Accepts either:
 * - thumbnailUrl: Direct URL to set
 * - kickVideoId: Kick video/stream ID to construct thumbnail URL from
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
        const { sessionId, thumbnailUrl, kickVideoId } = body

        if (!sessionId) {
            return NextResponse.json(
                { error: 'sessionId is required' },
                { status: 400 }
            )
        }

        if (!thumbnailUrl && !kickVideoId) {
            return NextResponse.json(
                { error: 'Either thumbnailUrl or kickVideoId is required' },
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
        } = {}

        // If thumbnailUrl is provided directly, use it
        if (thumbnailUrl !== undefined) {
            updateData.thumbnail_url = thumbnailUrl || null
        }

        // If kickVideoId is provided, store it and construct thumbnail URL if needed
        if (kickVideoId !== undefined) {
            updateData.kick_stream_id = kickVideoId || null

            // If no direct thumbnailUrl provided but kickVideoId is, try to construct thumbnail URL
            // Kick thumbnail URLs typically follow pattern: https://kick.com/thumbnail/{stream_id}
            if (!thumbnailUrl && kickVideoId) {
                // Try common Kick thumbnail URL patterns
                updateData.thumbnail_url = `https://kick.com/thumbnail/${kickVideoId}`
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
