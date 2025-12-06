import { NextResponse } from 'next/server'
import { getChannelWithLivestream, clearTokenCache } from '@/lib/kick-api'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/debug-kick-api?slug=channel-slug
 * Debug endpoint to test Kick Dev API integration
 */
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url)
        const slug = searchParams.get('slug') || 'sweetflips'
        const clearCache = searchParams.get('clear_cache') === 'true'

        if (clearCache) {
            clearTokenCache()
        }

        const result = await getChannelWithLivestream(slug)

        return NextResponse.json({
            success: true,
            channelSlug: slug,
            data: result,
            message: result
                ? `Found livestream data for ${slug}`
                : `No active livestream found for ${slug}`,
        })
    } catch (error) {
        console.error('Debug API error:', error)
        return NextResponse.json(
            {
                success: false,
                error: 'Failed to fetch from Kick Dev API',
                details: error instanceof Error ? error.message : 'Unknown error',
                hint: 'Make sure KICK_CLIENT_ID and KICK_CLIENT_SECRET are set in environment variables',
            },
            { status: 500 }
        )
    }
}
