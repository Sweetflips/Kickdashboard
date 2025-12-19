import { NextResponse } from 'next/server'
import { peekMessages } from '@/lib/message-buffer'
import { rewriteApiMediaUrlToCdn } from '@/lib/media-url'

export const dynamic = 'force-dynamic'

// Helper function to check if a user should be verified
function isVerifiedUser(username: string, badges: Array<{ type: string }> = []): boolean {
    const verifiedUsernames = ['botrix', 'kickbot', 'sweetflips']
    const usernameLower = username?.toLowerCase() || ''

    if (verifiedUsernames.includes(usernameLower)) {
        return true
    }

    if (badges.some(badge => badge.type === 'verified' || badge.type === 'verified_user')) {
        return true
    }

    return false
}

/**
 * GET /api/chat/recent
 * Returns recent messages from Redis buffer (not yet flushed to PostgreSQL)
 * Used for hybrid loading to prevent message gaps on page load/reconnect
 */
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url)
        const limit = Math.min(parseInt(searchParams.get('limit') || '100'), 200) // Cap at 200
        const broadcasterUserId = searchParams.get('broadcaster_user_id')

        // Get messages from Redis buffer
        const bufferedMessages = await peekMessages(limit)

        if (bufferedMessages.length === 0) {
            return NextResponse.json({
                messages: [],
                source: 'redis-buffer',
                timestamp: Date.now(),
            })
        }

        // Filter by broadcaster if provided
        let filteredMessages = bufferedMessages
        if (broadcasterUserId) {
            filteredMessages = bufferedMessages.filter(
                msg => msg.broadcaster.kick_user_id.toString() === broadcasterUserId
            )
        }

        // Format messages to match ChatMessage interface
        const formattedMessages = filteredMessages.map(msg => ({
            message_id: msg.message_id,
            broadcaster: {
                is_anonymous: false,
                user_id: msg.broadcaster.kick_user_id,
                username: msg.broadcaster.username,
                is_verified: false,
                profile_picture: rewriteApiMediaUrlToCdn(msg.broadcaster.profile_picture) || undefined,
                channel_slug: '',
                identity: null,
            },
            sender: {
                is_anonymous: msg.sender.is_anonymous || false,
                user_id: msg.sender.kick_user_id,
                username: msg.sender.username,
                is_verified: msg.sender.is_verified || isVerifiedUser(
                    msg.sender.username,
                    msg.sender.badges || []
                ),
                profile_picture: rewriteApiMediaUrlToCdn(msg.sender.profile_picture) || undefined,
                channel_slug: '',
                identity: {
                    username_color: msg.sender.color || '#FFFFFF',
                    badges: msg.sender.badges || [],
                },
            },
            content: msg.content,
            emotes: msg.emotes || [],
            timestamp: msg.timestamp,
            sweet_coins_earned: (msg as any).sweet_coins_earned || 0, // Include coin data from buffer
            sweet_coins_reason: (msg as any).sweet_coins_reason || undefined,
            sent_when_offline: !msg.is_stream_active || !msg.stream_session_id,
        }))

        return NextResponse.json({
            messages: formattedMessages,
            source: 'redis-buffer',
            timestamp: Date.now(),
        }, {
            headers: {
                'Cache-Control': 'no-cache, no-store, must-revalidate',
            },
        })
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        console.error('[chat/recent] Error fetching recent messages:', errorMessage)
        return NextResponse.json(
            { error: 'Failed to fetch recent messages', details: errorMessage },
            { status: 500 }
        )
    }
}
