import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

/**
 * Get top 10 chatters for stream session
 * GET /api/stream-session/leaderboard?broadcaster_user_id=123&session_id=456
 * If session_id is provided, get leaderboard for that session
 * Otherwise, get leaderboard for active session
 */
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url)
        const broadcasterUserId = searchParams.get('broadcaster_user_id')
        const sessionId = searchParams.get('session_id')

        let session

        if (sessionId) {
            // Get specific session
            session = await db.streamSession.findUnique({
                where: { id: BigInt(sessionId) },
            })
        } else if (broadcasterUserId) {
            // Find active stream session ONLY (no fallback to past sessions)
            // When stream is offline, return empty leaderboard
            session = await db.streamSession.findFirst({
                where: {
                    broadcaster_user_id: BigInt(broadcasterUserId),
                    ended_at: null,
                },
                orderBy: { started_at: 'desc' },
            })

            // If no active session, return empty leaderboard (stream is offline)
            if (!session) {
                // Stream is offline - return empty without logging
                return NextResponse.json({
                    leaderboard: [],
                    session_id: null,
                    has_active_session: false,
                })
            }
        } else {
            return NextResponse.json(
                { error: 'broadcaster_user_id or session_id is required' },
                { status: 400 }
            )
        }

        if (!session) {
            // No session found, return empty leaderboard
            return NextResponse.json({
                leaderboard: [],
                session_id: null,
                has_active_session: false,
            })
        }

        // Only check for active session when querying by broadcaster_user_id
        // When session_id is provided, allow querying ended sessions
        if (!sessionId && session.ended_at !== null) {
            // Session was ended and we're querying by broadcaster_user_id - return empty leaderboard
            return NextResponse.json({
                leaderboard: [],
                session_id: null,
                has_active_session: false,
            })
        }

        // Get all messages for this session to count per user
        const allMessages = await db.chatMessage.findMany({
            where: {
                stream_session_id: session.id,
            },
            select: {
                sender_user_id: true, // This is kick_user_id
                emotes: true,
            },
        })

        // Get total points earned in this session
        const totalPointsResult = await db.pointHistory.aggregate({
            where: {
                stream_session_id: session.id,
            },
            _sum: {
                points_earned: true,
            },
        })

        const totalPoints = totalPointsResult._sum.points_earned || 0
        const totalMessages = allMessages.length
        const uniqueChatters = new Set(allMessages.map(m => m.sender_user_id.toString())).size

        // Get points aggregated by user (user_id is internal ID)
        const pointsByUser = await db.pointHistory.groupBy({
            by: ['user_id'],
            where: {
                stream_session_id: session.id,
            },
            _sum: {
                points_earned: true,
            },
        })

        // Create a map of kick_user_id to internal user_id for lookup
        const kickUserIdToInternalId = new Map<bigint, bigint>()

        // Get all unique kick_user_ids from messages
        const kickUserIds = [...new Set(allMessages.map(m => m.sender_user_id))]

        // Convert kick_user_ids to internal user IDs
        if (kickUserIds.length > 0) {
            const users = await db.user.findMany({
                where: {
                    kick_user_id: { in: kickUserIds },
                },
                select: {
                    id: true,
                    kick_user_id: true,
                },
            })

            for (const user of users) {
                kickUserIdToInternalId.set(user.kick_user_id, user.id)
            }
        }

        // Create a map of internal user_id to stats
        const userStatsMap = new Map<bigint, {
            points: number
            messages: number
            emotes: number
        }>()

        // Count messages and emotes per user (convert kick_user_id to internal ID)
        let totalEmotesCounted = 0
        let messagesWithEmotes = 0

        for (const msg of allMessages) {
            const internalUserId = kickUserIdToInternalId.get(msg.sender_user_id)
            if (!internalUserId) continue // Skip if user not found

            const existing = userStatsMap.get(internalUserId) || { points: 0, messages: 0, emotes: 0 }
            existing.messages = (existing.messages || 0) + 1

            // Count emotes if present - handle Prisma JSON field
            let emotesData = msg.emotes
            if (emotesData !== null && emotesData !== undefined) {
                // Prisma returns JSON as parsed object, but handle string case
                if (typeof emotesData === 'string') {
                    try {
                        emotesData = JSON.parse(emotesData)
                    } catch {
                        emotesData = null
                    }
                }

                // Check if it's an array with items
                if (Array.isArray(emotesData) && emotesData.length > 0) {
                    messagesWithEmotes++
                    const emoteCount = emotesData.reduce((total: number, emote: any) => {
                        if (emote && typeof emote === 'object') {
                            // Handle emote object with positions array
                            if (emote.positions && Array.isArray(emote.positions)) {
                                return total + emote.positions.length
                            }
                            // Handle case where positions might be in different format
                            if (emote.position && Array.isArray(emote.position)) {
                                return total + emote.position.length
                            }
                        }
                        return total
                    }, 0)
                    if (emoteCount > 0) {
                        existing.emotes = (existing.emotes || 0) + emoteCount
                        totalEmotesCounted += emoteCount
                    }
                }
            }

            userStatsMap.set(internalUserId, existing)
        }

        // Add points (preserve existing messages and emotes)
        for (const pt of pointsByUser) {
            const existing = userStatsMap.get(pt.user_id) || { points: 0, messages: 0, emotes: 0 }
            // Preserve existing emotes and messages when updating points
            existing.points = pt._sum.points_earned || 0
            userStatsMap.set(pt.user_id, existing)
        }

        // Convert to array and sort by points (descending), but include users with emotes even if no points
        const userStatsArray = Array.from(userStatsMap.entries())
            .map(([user_id, stats]) => ({ user_id, ...stats }))
            .sort((a, b) => {
                // Sort by points first, then by emotes if points are equal
                if (b.points !== a.points) {
                    return b.points - a.points
                }
                return b.emotes - a.emotes
            })
            .slice(0, 10) // Top 10

        // Get user details for each chatter
        const leaderboard = await Promise.all(
            userStatsArray.map(async (entry, index) => {
                const user = await db.user.findUnique({
                    where: { id: entry.user_id },
                    select: {
                        kick_user_id: true,
                        username: true,
                        profile_picture_url: true,
                        custom_profile_picture_url: true,
                    },
                })

                return {
                    rank: index + 1,
                    user_id: entry.user_id.toString(),
                    kick_user_id: user?.kick_user_id.toString() || '',
                    username: user?.username || 'Unknown',
                    profile_picture_url: user?.custom_profile_picture_url || user?.profile_picture_url || null,
                    points_earned: entry.points,
                    messages_sent: entry.messages,
                    emotes_used: entry.emotes,
                }
            })
        )

        return NextResponse.json({
            leaderboard,
            session_id: session.id.toString(),
            session_title: session.session_title,
            started_at: session.started_at.toISOString(),
            ended_at: session.ended_at?.toISOString() || null,
            has_active_session: session.ended_at === null,
            stats: {
                total_messages: totalMessages,
                total_points: totalPoints,
                unique_chatters: uniqueChatters,
            },
        })
    } catch (error) {
        console.error('Error fetching stream session leaderboard:', error)
        return NextResponse.json(
            { error: 'Failed to fetch stream session leaderboard', details: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        )
    }
}
