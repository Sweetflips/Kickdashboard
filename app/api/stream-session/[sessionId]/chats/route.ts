import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { isAdmin } from '@/lib/auth'
import { rewriteApiMediaUrlToCdn } from '@/lib/media-url'
import { Prisma } from '@prisma/client'

type MessageWithRelations = {
    message_id: string
    sender_is_anonymous: boolean
    sender_username: string
    sender_is_verified: boolean
    sender_username_color: string | null
    sender_badges: Prisma.JsonValue
    content: string
    emotes: Prisma.JsonValue
    timestamp: bigint
    sweet_coins_earned: number
    sender: {
        kick_user_id: bigint
        username: string
        profile_picture_url: string | null
        custom_profile_picture_url: string | null
    }
    broadcaster: {
        kick_user_id: bigint
        username: string
    }
}

/**
 * Get all chat messages for a specific stream session
 * GET /api/stream-session/[sessionId]/chats?limit=100&offset=0
 * Admin-only: Past streams are restricted to administrators
 */
export async function GET(
    request: Request,
    { params }: { params: Promise<{ sessionId: string }> }
) {
    try {
        // Check admin access - Past Streams are admin-only
        const adminCheck = await isAdmin(request)
        if (!adminCheck) {
            return NextResponse.json(
                { error: 'Unauthorized - Admin access required' },
                { status: 403 }
            )
        }

        const { searchParams } = new URL(request.url)
        const limit = Math.max(1, Math.min(500, parseInt(searchParams.get('limit') || '100', 10) || 100))
        const offset = Math.max(0, parseInt(searchParams.get('offset') || '0', 10) || 0)

        const { sessionId } = await params

        if (!sessionId) {
            return NextResponse.json(
                { error: 'session_id is required' },
                { status: 400 }
            )
        }

        // Verify session exists
        const session = await db.streamSession.findUnique({
            where: { id: BigInt(sessionId) },
            select: {
                id: true,
                session_title: true,
                started_at: true,
                ended_at: true,
            },
        })

        if (!session) {
            return NextResponse.json(
                { error: 'Stream session not found' },
                { status: 404 }
            )
        }

        // Get total count
        const total = await db.chatMessage.count({
            where: {
                stream_session_id: BigInt(sessionId),
            },
        })

        // Get messages
        const messages = await db.chatMessage.findMany({
            where: {
                stream_session_id: BigInt(sessionId),
            },
            orderBy: {
                timestamp: 'asc',
            },
            take: limit,
            skip: offset,
            include: {
                sender: {
                    select: {
                        kick_user_id: true,
                        username: true,
                        profile_picture_url: true,
                        custom_profile_picture_url: true,
                    },
                },
                broadcaster: {
                    select: {
                        kick_user_id: true,
                        username: true,
                    },
                },
            },
        })

        // Format messages
        const formattedMessages = messages.map((msg: any) => {
            const m = msg as MessageWithRelations
            return {
            message_id: m.message_id,
            sender: {
                is_anonymous: m.sender_is_anonymous || false,
                user_id: Number(m.sender.kick_user_id),
                username: m.sender_username,
                is_verified: m.sender_is_verified || false,
                profile_picture: rewriteApiMediaUrlToCdn(m.sender.custom_profile_picture_url || m.sender.profile_picture_url) || undefined,
                channel_slug: '',
                identity: {
                    username_color: m.sender_username_color || '#FFFFFF',
                    badges: (m.sender_badges as any) || [],
                },
            },
            broadcaster: {
                is_anonymous: false,
                user_id: Number(m.broadcaster.kick_user_id),
                username: m.broadcaster.username,
                is_verified: false,
                profile_picture: undefined,
                channel_slug: '',
                identity: null,
            },
            content: m.content,
            emotes: (m.emotes as any) || [],
            timestamp: Number(m.timestamp),
            sweet_coins_earned: m.sweet_coins_earned || 0,
        }})

        return NextResponse.json({
            messages: formattedMessages,
            total,
            limit,
            offset,
            session: {
                id: session.id.toString(),
                session_title: session.session_title,
                started_at: session.started_at.toISOString(),
                ended_at: session.ended_at?.toISOString() || null,
            },
        })
    } catch (error) {
        console.error('Error fetching stream session chats:', error)
        return NextResponse.json(
            { error: 'Failed to fetch stream session chats', details: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        )
    }
}
