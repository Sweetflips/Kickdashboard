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
        const offlineWhere: any = {}
        if (streamSessionId) {
            where.stream_session_id = BigInt(streamSessionId)
            // Offline messages don't have stream_session_id, so skip them when filtering by session
        }
        if (broadcasterUserId) {
            where.broadcaster_user_id = BigInt(broadcasterUserId)
            offlineWhere.broadcaster_user_id = BigInt(broadcasterUserId)
        }
        // Note: Offline messages are now in a separate table
        // We merge queries from both tables to show all messages together

        // Fetch messages from both tables
        const [onlineMessages, offlineMessages, onlineTotal, offlineTotal] = await Promise.all([
            db.chatMessage.findMany({
                where,
                orderBy: { timestamp: 'desc' },
                take: limit * 2, // Get more to account for merging
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
            broadcasterUserId ? db.offlineChatMessage.findMany({
                where: offlineWhere,
                orderBy: { timestamp: 'desc' },
                take: limit * 2, // Get more to account for merging
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
                },
            }) : [],
            db.chatMessage.count({ where }),
            broadcasterUserId ? db.offlineChatMessage.count({ where: offlineWhere }) : 0,
        ])

        // Combine and sort messages by timestamp
        const allMessages = [
            ...onlineMessages.map(msg => ({ ...msg, isOffline: false })),
            ...offlineMessages.map(msg => ({ ...msg, isOffline: true })),
        ].sort((a, b) => {
            const aTime = Number(a.timestamp)
            const bTime = Number(b.timestamp)
            return bTime - aTime // Descending order
        }).slice(0, limit) // Apply final limit after merging

        const total = onlineTotal + offlineTotal

        // Format messages to match ChatMessage interface
        const formattedMessages = allMessages.map(msg => {
            if (msg.isOffline) {
                // Format offline message
                const offlineMsg = msg as typeof offlineMessages[0] & { isOffline: true }
                return {
                    message_id: offlineMsg.message_id,
                    broadcaster: {
                        is_anonymous: false,
                        user_id: Number(offlineMsg.broadcaster.kick_user_id),
                        username: offlineMsg.broadcaster.username,
                        is_verified: false,
                        profile_picture: offlineMsg.broadcaster.profile_picture_url || undefined,
                        channel_slug: '',
                        identity: null,
                    },
                    sender: {
                        is_anonymous: offlineMsg.sender_is_anonymous || false,
                        user_id: Number(offlineMsg.sender.kick_user_id),
                        username: offlineMsg.sender_username,
                        is_verified: offlineMsg.sender_is_verified || isVerifiedUser(
                            offlineMsg.sender_username,
                            (offlineMsg.sender_badges as any) || []
                        ),
                        profile_picture: offlineMsg.sender.profile_picture_url || undefined,
                        channel_slug: '',
                        identity: {
                            username_color: offlineMsg.sender_username_color || '#FFFFFF',
                            badges: (offlineMsg.sender_badges as any) || [],
                        },
                    },
                    content: offlineMsg.content,
                    emotes: (offlineMsg.emotes as any) || [],
                    timestamp: Number(offlineMsg.timestamp),
                    points_earned: 0, // Offline messages have no points
                    sent_when_offline: true,
                }
            } else {
                // Format online message
                const onlineMsg = msg as typeof onlineMessages[0]
                return {
                    message_id: onlineMsg.message_id,
                    broadcaster: {
                        is_anonymous: false,
                        user_id: Number(onlineMsg.broadcaster.kick_user_id),
                        username: onlineMsg.broadcaster.username,
                        is_verified: false,
                        profile_picture: onlineMsg.broadcaster.profile_picture_url || undefined,
                        channel_slug: onlineMsg.stream_session?.channel_slug || '',
                        identity: null,
                    },
                    sender: {
                        is_anonymous: onlineMsg.sender_is_anonymous || false,
                        user_id: Number(onlineMsg.sender.kick_user_id),
                        username: onlineMsg.sender_username,
                        is_verified: onlineMsg.sender_is_verified || isVerifiedUser(
                            onlineMsg.sender_username,
                            (onlineMsg.sender_badges as any) || []
                        ),
                        profile_picture: onlineMsg.sender.profile_picture_url || undefined,
                        channel_slug: '',
                        identity: {
                            username_color: onlineMsg.sender_username_color || '#FFFFFF',
                            badges: (onlineMsg.sender_badges as any) || [],
                        },
                    },
                    content: onlineMsg.content,
                    emotes: (onlineMsg.emotes as any) || [],
                    timestamp: Number(onlineMsg.timestamp),
                    points_earned: onlineMsg.points_earned || 0,
                    sent_when_offline: false,
                }
            }
        })

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
