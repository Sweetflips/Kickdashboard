import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { rewriteApiMediaUrlToCdn } from '@/lib/media-url'
import { getAuthenticatedUser } from '@/lib/auth'
import { validateApiKey } from '@/lib/api-key-auth'
import { Prisma } from '@prisma/client'

export const dynamic = 'force-dynamic'

// Type for offline message with relations
type OfflineMessageWithRelations = {
    id: bigint
    message_id: string
    content: string
    emotes: Prisma.JsonValue
    has_emotes: boolean
    timestamp: bigint
    created_at: Date
    sender_user_id: bigint
    sender_username: string
    sender_username_color: string | null
    sender_badges: Prisma.JsonValue
    sender_is_verified: boolean
    sender_is_anonymous: boolean
    broadcaster_user_id: bigint
    engagement_type: string | null
    message_length: number | null
    exclamation_count: number | null
    sentence_count: number | null
    sender: {
        username: string
        profile_picture_url: string | null
        kick_user_id: bigint
    }
    broadcaster: {
        username: string
        profile_picture_url: string | null
        kick_user_id: bigint
    }
    isOffline?: boolean
}

// Type for online message with relations
type OnlineMessageWithRelations = {
    id: bigint
    message_id: string
    stream_session_id: bigint | null
    sender_user_id: bigint
    sender_username: string
    broadcaster_user_id: bigint
    content: string
    emotes: Prisma.JsonValue
    timestamp: bigint
    sender_username_color: string | null
    sender_badges: Prisma.JsonValue
    sender_is_verified: boolean
    sender_is_anonymous: boolean
    sweet_coins_earned: number
    sweet_coins_reason: string | null
    sent_when_offline: boolean
    sender: {
        username: string
        profile_picture_url: string | null
        kick_user_id: bigint
    }
    broadcaster: {
        username: string
        profile_picture_url: string | null
        kick_user_id: bigint
    }
    stream_session: {
        channel_slug: string
    } | null
    isOffline?: boolean
}

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

/**
 * GET /api/chat
 * Fetch chat messages
 * 
 * Authentication: Requires API key (?api_key=) OR authenticated session
 * External tools: Use ?api_key=YOUR_API_SECRET_KEY
 * Internal dashboard: Uses session cookies automatically
 */
export async function GET(request: Request) {
    try {
        // Allow external tools with API key
        const hasValidApiKey = validateApiKey(request, 'chat')
        
        // Allow authenticated users (internal dashboard)
        const auth = await getAuthenticatedUser(request)
        
        if (!hasValidApiKey && !auth) {
            return NextResponse.json(
                { error: 'Authentication required. Use api_key parameter or login.' },
                { status: 401 }
            )
        }

        const { searchParams } = new URL(request.url)
        const limit = Math.min(parseInt(searchParams.get('limit') || '100'), 500) // Cap at 500
        const cursor = searchParams.get('cursor') // Timestamp cursor for pagination
        const offset = parseInt(searchParams.get('offset') || '0') // Backward compatibility
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
        } else {
            console.warn(`📡 Chat API: broadcaster_user_id missing - will return all messages (unfiltered)`)
        }

        // Use cursor-based pagination if cursor is provided, otherwise fall back to offset
        const useCursor = cursor !== null && cursor !== undefined && cursor !== ''
        const cursorTimestamp = useCursor ? BigInt(cursor) : null

        // Build where clauses with cursor support
        const onlineWhere = { ...where }
        const offlineWhereWithCursor = { ...offlineWhere }

        if (useCursor && cursorTimestamp) {
            // Cursor-based: get messages before this timestamp
            onlineWhere.timestamp = { lt: cursorTimestamp }
            offlineWhereWithCursor.timestamp = { lt: cursorTimestamp }
        }

        // Fetch messages from both tables (no COUNT queries - much faster)
        const [onlineMessages, offlineMessages] = await Promise.all([
            db.chatMessage.findMany({
                where: onlineWhere,
                orderBy: { timestamp: 'desc' },
                take: useCursor ? limit : limit * 2, // Less overhead with cursor
                ...(useCursor ? {} : { skip: offset }), // Only use skip if not using cursor
                select: {
                    message_id: true,
                    stream_session_id: true,
                    sender_user_id: true,
                    sender_username: true,
                    broadcaster_user_id: true,
                    content: true,
                    emotes: true,
                    timestamp: true,
                    sender_username_color: true,
                    sender_badges: true,
                    sender_is_verified: true,
                    sender_is_anonymous: true,
                    sweet_coins_earned: true,
                    sweet_coins_reason: true,
                    sent_when_offline: true,
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
                where: offlineWhereWithCursor,
                orderBy: { timestamp: 'desc' },
                take: useCursor ? limit : limit * 2,
                ...(useCursor ? {} : { skip: offset }),
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
        ])

        // Combine and sort messages by timestamp
        const allMessages = [
            ...(onlineMessages as any[]).map((msg: any) => ({ ...msg, isOffline: false })),
            ...(offlineMessages as any[]).map((msg: any) => ({ ...msg, isOffline: true })),
        ].sort((a: any, b: any) => {
            const aTime = Number(a.timestamp)
            const bTime = Number(b.timestamp)
            return bTime - aTime // Descending order
        }).slice(0, limit) // Apply final limit after merging

        // Calculate next cursor from the last message
        const nextCursor = allMessages.length > 0
            ? allMessages[allMessages.length - 1].timestamp.toString()
            : null

        // Format messages to match ChatMessage interface
        const formattedMessages = allMessages.map(msg => {
            if (msg.isOffline) {
                // Format offline message
                const offlineMsg = msg as OfflineMessageWithRelations
                return {
                    message_id: offlineMsg.message_id,
                    broadcaster: {
                        is_anonymous: false,
                        user_id: Number(offlineMsg.broadcaster.kick_user_id),
                        username: offlineMsg.broadcaster.username,
                        is_verified: false,
                        profile_picture: rewriteApiMediaUrlToCdn(offlineMsg.broadcaster.profile_picture_url) || undefined,
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
                        profile_picture: rewriteApiMediaUrlToCdn(offlineMsg.sender.profile_picture_url) || undefined,
                        channel_slug: '',
                        identity: {
                            username_color: offlineMsg.sender_username_color || '#FFFFFF',
                            badges: (offlineMsg.sender_badges as any) || [],
                        },
                    },
                    content: offlineMsg.content,
                    emotes: (offlineMsg.emotes as any) || [],
                    timestamp: Number(offlineMsg.timestamp),
                    sweet_coins_earned: 0, // Offline messages have no Sweet Coins
                    sent_when_offline: true,
                }
            } else {
                // Format online message
                const onlineMsg = msg as OnlineMessageWithRelations
                return {
                    message_id: onlineMsg.message_id,
                    broadcaster: {
                        is_anonymous: false,
                        user_id: Number(onlineMsg.broadcaster.kick_user_id),
                        username: onlineMsg.broadcaster.username,
                        is_verified: false,
                        profile_picture: rewriteApiMediaUrlToCdn(onlineMsg.broadcaster.profile_picture_url) || undefined,
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
                        profile_picture: rewriteApiMediaUrlToCdn(onlineMsg.sender.profile_picture_url) || undefined,
                        channel_slug: '',
                        identity: {
                            username_color: onlineMsg.sender_username_color || '#FFFFFF',
                            badges: (onlineMsg.sender_badges as any) || [],
                        },
                    },
                    content: onlineMsg.content,
                    emotes: (onlineMsg.emotes as any) || [],
                    timestamp: Number(onlineMsg.timestamp),
                    sweet_coins_earned: onlineMsg.sweet_coins_earned || 0,
                    sweet_coins_reason: onlineMsg.sweet_coins_reason || undefined,
                    sent_when_offline: false,
                }
            }
        })

        return NextResponse.json({
            messages: formattedMessages,
            limit,
            ...(useCursor ? { cursor: nextCursor } : { offset, total: null }), // total deprecated but kept for backward compatibility
            hasMore: formattedMessages.length === limit, // Indicates if there might be more messages
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
