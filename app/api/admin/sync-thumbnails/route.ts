import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { syncThumbnailsForActiveStreams } from '@/lib/kick-api'

/**
 * POST /api/admin/sync-thumbnails
 * Sync thumbnails for all active streams using Kick Dev API
 */
export async function POST(request: Request) {
    try {
        const prisma = db as any
        // Get all active stream sessions
        const activeSessions = await prisma.streamSession.findMany({
            where: {
                ended_at: null, // Only active sessions
            },
            select: {
                id: true,
                channel_slug: true,
                thumbnail_url: true,
            },
            distinct: ['channel_slug'], // Get unique channel slugs
        })

        if (activeSessions.length === 0) {
            return NextResponse.json({
                success: true,
                message: 'No active streams to sync',
                stats: {
                    processed: 0,
                    updated: 0,
                    errors: 0,
                },
            })
        }

        const channelSlugs = (activeSessions as any[])
            .map((s: any) => s.channel_slug)
            .filter((slug: any): slug is string => Boolean(slug))

        console.log(`Syncing thumbnails for ${channelSlugs.length} active channels`)

        // Fetch thumbnails from Kick API
        const thumbnailMap = await syncThumbnailsForActiveStreams(channelSlugs)

        const stats = {
            processed: 0,
            updated: 0,
            errors: 0,
        }

        // Update database with new thumbnails
        for (const session of activeSessions) {
            if (!session.channel_slug) continue

            stats.processed++
            const newThumbnailUrl = thumbnailMap.get(session.channel_slug)

            // Only update if thumbnail changed and is not null
            if (newThumbnailUrl !== undefined && newThumbnailUrl !== session.thumbnail_url && newThumbnailUrl !== null) {
                try {
                    // Update all active sessions for this channel
                    await prisma.streamSession.updateMany({
                        where: {
                            channel_slug: session.channel_slug,
                            ended_at: null,
                        },
                        data: {
                            thumbnail_url: newThumbnailUrl,
                        },
                    })
                    stats.updated++
                    console.log(`Updated thumbnail for channel ${session.channel_slug}`)
                } catch (error) {
                    console.error(`Error updating thumbnail for ${session.channel_slug}:`, error)
                    stats.errors++
                }
            }
        }

        return NextResponse.json({
            success: true,
            message: 'Thumbnail sync completed',
            stats,
        })
    } catch (error) {
        console.error('Thumbnail sync error:', error)
        return NextResponse.json(
            {
                error: 'Failed to sync thumbnails',
                details: error instanceof Error ? error.message : 'Unknown error',
            },
            { status: 500 }
        )
    }
}
