import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

// Helper function to check if a user should be verified
function isVerifiedUser(username: string, badges: Array<{ type: string }> = []): boolean {
    const verifiedUsernames = ['botrix', 'kickbot', 'sweetflips']
    const usernameLower = username?.toLowerCase() || ''

    // Check if username is in verified list
    if (verifiedUsernames.includes(usernameLower)) {
        return true
    }

    // Check if there's a verified badge
    if (badges.some(badge => badge.type === 'verified' || badge.type === 'verified_user')) {
        return true
    }

    return false
}

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url)
        const limit = parseInt(searchParams.get('limit') || '100')
        const offset = parseInt(searchParams.get('offset') || '0')
        const streamSessionId = searchParams.get('stream_session_id')
        const broadcasterUserId = searchParams.get('broadcaster_user_id')

        const where: any = {}
        if (streamSessionId) {
            where.stream_session_id = BigInt(streamSessionId)
        }
        if (broadcasterUserId) {
            where.broadcaster_user_id = BigInt(broadcasterUserId)
        }

        const [messages, total] = await Promise.all([
            db.chatMessage.findMany({
                where,
                orderBy: { created_at: 'desc' },
                take: limit,
                skip: offset,
                include: {
                    sender: {
                        select: {
                            username: true,
                            profile_picture_url: true,
                            kick_user_id: true,
                        },
                    },
                    broadcaster: {
                        select: {
                            username: true,
                            profile_picture_url: true,
                            kick_user_id: true,
                        },
                    },
                    stream_session: {
                        select: {
                            channel_slug: true,
                        },
                    },
                },
            }),
            db.chatMessage.count({ where }),
        ])

        // Format messages to match ChatMessage interface
        const formattedMessages = messages.map(msg => ({
            message_id: msg.message_id,
            broadcaster: {
                is_anonymous: false,
                user_id: Number(msg.broadcaster.kick_user_id),
                username: msg.broadcaster.username,
                is_verified: false,
                profile_picture: msg.broadcaster.profile_picture_url || undefined,
                channel_slug: msg.stream_session?.channel_slug || '',
                identity: null,
            },
            sender: {
                is_anonymous: msg.sender_is_anonymous || false,
                user_id: Number(msg.sender.kick_user_id),
                username: msg.sender_username,
                is_verified: msg.sender_is_verified || isVerifiedUser(
                    msg.sender_username,
                    (msg.sender_badges as any) || []
                ),
                profile_picture: msg.sender.profile_picture_url || undefined,
                channel_slug: '',
                identity: {
                    username_color: msg.sender_username_color || '#FFFFFF',
                    badges: (msg.sender_badges as any) || [],
                },
            },
            content: msg.content,
            emotes: (msg.emotes as any) || [],
            timestamp: Number(msg.timestamp),
            points_earned: msg.points_earned || 0,
        }))

        console.log(`📡 Chat API: Returning ${formattedMessages.length} messages from database (total: ${total}, limit: ${limit}, offset: ${offset})`)

        return NextResponse.json({
            messages: formattedMessages,
            total,
            limit,
            offset,
        })
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        console.error('Chat API error:', errorMessage)
        return NextResponse.json(
            { error: 'Failed to fetch chat messages', details: errorMessage },
            { status: 500 }
        )
    }
}

// POST endpoint is deprecated - messages should come through webhook
export async function POST(request: Request) {
    return NextResponse.json(
        { error: 'POST endpoint deprecated. Messages should be sent via webhook.' },
        { status: 405 }
    )
}
