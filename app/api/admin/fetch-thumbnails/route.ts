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

        // Note: Kick's historical video API is blocked (403)
        // This endpoint can only work with manually provided video data
        // For now, return a helpful message
        console.warn(`[Fetch Thumbnails] Kick's legacy video API is blocked - cannot fetch historical thumbnails`)

        return NextResponse.json({
            success: true,
            message: `Found ${sessionsWithoutThumbnails.length} streams without thumbnails, but Kick's video API is blocked. Thumbnails are captured automatically when streams go live.`,
            stats: {
                processed: sessionsWithoutThumbnails.length,
                matched: 0,
                updated: 0,
                errors: 0,
            },
            note: 'Historical VOD thumbnails cannot be fetched due to Kick API limitations. Future streams will have thumbnails captured automatically.',
            sessionsNeedingThumbnails: sessionsWithoutThumbnails.length,
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
