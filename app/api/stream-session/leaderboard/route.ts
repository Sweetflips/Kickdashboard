import { isAdmin, getAuthenticatedUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { memoryCache } from '@/lib/memory-cache'
import { rewriteApiMediaUrlToCdn } from '@/lib/media-url'
import { NextResponse } from 'next/server'
import { getSessionLeaderboard } from '@/lib/sweet-coins-redis'
import { logger } from '@/lib/logger'
import { validateApiKey } from '@/lib/api-key-auth'

export const dynamic = 'force-dynamic'

/**
 * Get top chatters for stream session
 * GET /api/stream-session/leaderboard?broadcaster_user_id=123&session_id=456
 * If session_id is provided, get leaderboard for that session (admin-only for past streams)
 * Otherwise, get leaderboard for active session
 *
 * Authentication: Requires API key (?api_key=) OR authenticated session
 * External tools: Use ?api_key=YOUR_API_SECRET_KEY
 * Internal dashboard: Uses session cookies automatically
 */
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url)
        const broadcasterUserId = searchParams.get('broadcaster_user_id')
        const sessionId = searchParams.get('session_id')

        // Allow external tools with API key
        const hasValidApiKey = validateApiKey(request, 'stream-leaderboard')

        // Allow authenticated users (internal dashboard)
        const auth = await getAuthenticatedUser(request)

        // If session_id is provided, this is a past stream - require admin access
        if (sessionId) {
            const adminCheck = await isAdmin(request)
            if (!adminCheck) {
                return NextResponse.json(
                    { error: 'Unauthorized - Admin access required for past stream leaderboards' },
                    { status: 403 }
                )
            }
        } else {
            // For active sessions, require either API key or authenticated session
            if (!hasValidApiKey && !auth) {
                return NextResponse.json(
                    { error: 'Authentication required. Use api_key parameter or login.' },
                    { status: 401 }
                )
            }
        }

        let session: {
            id: bigint
            ended_at: Date | null
            session_title: string | null
            started_at: Date
            broadcaster_user_id: bigint
        } | null | undefined

        // Helper function for session queries with retry logic
        const findSessionWithRetry = async <T>(queryFn: () => Promise<T>, maxRetries = 3): Promise<T | null> => {
            for (let attempt = 0; attempt < maxRetries; attempt++) {
                try {
                    return await queryFn()
                } catch (error: any) {
                    if ((error?.code === 'P2024' || error?.message?.includes('connection pool')) && attempt < maxRetries - 1) {
                        await new Promise(resolve => setTimeout(resolve, 100 * Math.pow(2, attempt)))
                        continue
                    }
                    throw error
                }
            }
            return null
        }

        if (sessionId) {
            session = await findSessionWithRetry(() => db.streamSession.findUnique({
                where: { id: BigInt(sessionId) },
            }))
        } else if (broadcasterUserId) {
            session = await findSessionWithRetry(() => db.streamSession.findFirst({
                where: {
                    broadcaster_user_id: BigInt(broadcasterUserId),
                    ended_at: null,
                },
                orderBy: { started_at: 'desc' },
            }))

            if (!session) {
                return NextResponse.json({
                    leaderboard: [],
                    session_id: null,
                    has_active_session: false,
                    stats: {
                        total_messages: 0,
                        total_points: 0,
                        unique_chatters: 0,
                    },
                }, {
                    headers: {
                        'Cache-Control': 'public, max-age=5, stale-while-revalidate=10',
                    },
                })
            }
        } else {
            return NextResponse.json(
                { error: 'broadcaster_user_id or session_id is required' },
                { status: 400 }
            )
        }

        if (!session) {
            return NextResponse.json({
                leaderboard: [],
                session_id: null,
                has_active_session: false,
                stats: {
                    total_messages: 0,
                    total_points: 0,
                    unique_chatters: 0,
                },
            })
        }

        if (!sessionId && session.ended_at !== null) {
            return NextResponse.json({
                leaderboard: [],
                session_id: null,
                has_active_session: false,
                stats: {
                    total_messages: 0,
                    total_points: 0,
                    unique_chatters: 0,
                },
            })
        }

        // Cache key - use session ID for active sessions, or session_id param for past sessions
        const cacheKey = `stream-leaderboard:${session.id.toString()}`
        const cacheTTL = session.ended_at === null ? 1000 : 30000 // 1s for active (near real-time), 30s for ended

        // Try cache first
        const cached = memoryCache.get<{
            leaderboard: any[]
            stats: any
            session: any
        }>(cacheKey)

        if (cached) {
            return NextResponse.json({
                leaderboard: cached.leaderboard,
                session_id: cached.session.id.toString(),
                session_title: cached.session.session_title,
                started_at: cached.session.started_at.toISOString(),
                ended_at: cached.session.ended_at?.toISOString() || null,
                has_active_session: cached.session.ended_at === null,
                stats: cached.stats,
            }, {
                headers: {
                    'Cache-Control': session.ended_at === null
                        ? 'no-cache, no-store, must-revalidate' // Real-time for active sessions
                        : 'public, max-age=30, stale-while-revalidate=60',
                },
            })
        }

        // Helper function to execute queries with retry logic
        const executeQueryWithRetry = async <T>(queryFn: () => Promise<T>, maxRetries = 5): Promise<T> => {
            for (let attempt = 0; attempt < maxRetries; attempt++) {
                try {
                    return await queryFn()
                } catch (error: any) {
                    const isRetryableError = error?.code === 'P2024' ||
                        error?.code === 'P4001' ||
                        error?.code === 'P2034' ||
                        error?.message?.includes('could not serialize access') ||
                        error?.message?.includes('concurrent update') ||
                        error?.message?.includes('connection pool')

                    if (isRetryableError && attempt < maxRetries - 1) {
                        const delay = Math.min(100 * Math.pow(2, attempt), 2000)
                        await new Promise(resolve => setTimeout(resolve, delay))
                        continue
                    }
                    throw error
                }
            }
            throw new Error('Max retries exceeded')
        }

        // For active sessions, use Redis for live leaderboard data
        const isActiveSession = session.ended_at === null

        // Get Redis leaderboard for active sessions (live data)
        let redisLeaderboard: Array<{ userId: bigint; coins: number }> = []
        if (isActiveSession) {
            try {
                redisLeaderboard = await getSessionLeaderboard(session.id, 500) // Get top 500
            } catch (err) {
                console.warn('[leaderboard] Failed to get Redis leaderboard, falling back to DB:', err)
            }
        }

        // Use groupBy/aggregate instead of fetching all messages
        const [messageCounts, pointsByUser, totalPointsResult, totalMessagesResult] = await Promise.all([
            // Message counts per user (using kick_user_id from sender_user_id)
            executeQueryWithRetry(() => db.chatMessage.groupBy({
                by: ['sender_user_id'],
                where: {
                    stream_session_id: session.id,
                    sent_when_offline: false,
                    sender_user_id: { gt: BigInt(0) },
                },
                _count: {
                    id: true,
                },
            })),
            // Points aggregated by user (internal user_id) - only used for ended sessions
            isActiveSession && redisLeaderboard.length > 0
                ? Promise.resolve([]) // Skip DB query for active sessions with Redis data
                : executeQueryWithRetry(() => db.sweetCoinHistory.groupBy({
                    by: ['user_id'],
                    where: {
                        stream_session_id: session.id,
                    },
                    _sum: {
                        sweet_coins_earned: true,
                    },
                })),
            // Total points for stats - only used for ended sessions
            isActiveSession && redisLeaderboard.length > 0
                ? Promise.resolve({ _sum: { sweet_coins_earned: null } })
                : executeQueryWithRetry(() => db.sweetCoinHistory.aggregate({
                    where: {
                        stream_session_id: session.id,
                    },
                    _sum: {
                        sweet_coins_earned: true,
                    },
                })),
            // Total messages for stats
            executeQueryWithRetry(() => db.chatMessage.count({
                where: {
                    stream_session_id: session.id,
                    sent_when_offline: false,
                    sender_user_id: { gt: BigInt(0) },
                },
            })),
        ])

        // Calculate total points from Redis or DB
        const totalPoints = isActiveSession && redisLeaderboard.length > 0
            ? redisLeaderboard.reduce((sum, entry) => sum + entry.coins, 0)
            : ((totalPointsResult as any)._sum.sweet_coins_earned || 0)
        const totalMessages = totalMessagesResult
        const uniqueChatters = (messageCounts as any[]).length

        // Get kick_user_ids from message counts to fetch user details
        const kickUserIds = (messageCounts as Array<{ sender_user_id: bigint; _count: { id: number } }>).map(m => m.sender_user_id)

        // Also get user IDs from Redis leaderboard
        const redisUserIds = redisLeaderboard.map(entry => entry.userId)

        // Batch fetch user details (no N+1)
        // Need to fetch both by kick_user_id (for message counts) and by id (for Redis leaderboard)
        const usersPromises = [
            executeQueryWithRetry(() => db.user.findMany({
                where: {
                    kick_user_id: { in: kickUserIds },
                },
                select: {
                    id: true,
                    kick_user_id: true,
                    username: true,
                    profile_picture_url: true,
                    custom_profile_picture_url: true,
                },
            })),
        ]

        // If we have Redis data, also fetch those users by internal ID
        if (redisUserIds.length > 0) {
            usersPromises.push(
                executeQueryWithRetry(() => db.user.findMany({
                    where: {
                        id: { in: redisUserIds },
                    },
                    select: {
                        id: true,
                        kick_user_id: true,
                        username: true,
                        profile_picture_url: true,
                        custom_profile_picture_url: true,
                    },
                }))
            )
        }

        const usersResults = await Promise.all(usersPromises) as any[][]
        const allUsers = [...(usersResults[0] || []), ...(usersResults[1] || [])]

        // Deduplicate users by id
        const usersMap = new Map((allUsers as any[]).map((u: any) => [u.id.toString(), u]))
        const users = Array.from(usersMap.values()) as any[]

        // Create maps for lookups
        const kickUserIdToUser = new Map(users.map((u: any) => [Number(u.kick_user_id), u]))
        const userIdToUser = new Map(users.map((u: any) => [u.id.toString(), u]))

        // Points map - use Redis for active sessions, DB for ended sessions
        const userIdToPoints = new Map<number, number>()
        if (isActiveSession && redisLeaderboard.length > 0) {
            // Redis has internal user IDs
            redisLeaderboard.forEach(entry => {
                userIdToPoints.set(Number(entry.userId), entry.coins)
            })
        } else {
            (pointsByUser as any[]).forEach((p: any) => {
                userIdToPoints.set(Number(p.user_id), p._sum.sweet_coins_earned || 0)
            })
        }

        // Get emotes count - need to query messages with emotes
        // Since we can't filter JSON in groupBy, fetch messages with emotes only
        const messagesWithEmotes = await executeQueryWithRetry(() => db.chatMessage.findMany({
            where: {
                stream_session_id: session.id,
                sent_when_offline: false,
                sender_user_id: { in: kickUserIds, gt: BigInt(0) },
                has_emotes: true, // Use the indexed field
            },
            select: {
                sender_user_id: true,
                emotes: true,
            },
        }))

        // Count emotes per user
        const emotesMap = new Map<number, number>()
        ;(messagesWithEmotes as any[]).forEach((msg: any) => {
            const kickUserId = Number(msg.sender_user_id)
            const emotes = msg.emotes
            if (emotes && Array.isArray(emotes) && emotes.length > 0) {
                const emoteCount = emotes.reduce((total: number, emote: any) => {
                    if (emote && typeof emote === 'object') {
                        if (emote.positions && Array.isArray(emote.positions)) {
                            return total + emote.positions.length
                        }
                        if (emote.position && Array.isArray(emote.position)) {
                            return total + emote.position.length
                        }
                    }
                    return total
                }, 0)
                if (emoteCount > 0) {
                    emotesMap.set(kickUserId, (emotesMap.get(kickUserId) || 0) + emoteCount)
                }
            }
        })

        // Build user stats map
        const userStatsMap = new Map<number, {
            points: number
            messages: number
            emotes: number
            userId: bigint
        }>()

        // Process message counts
        ;(messageCounts as Array<{ sender_user_id: bigint; _count: { id: number } }>).forEach((count: any) => {
            const kickUserId = Number(count.sender_user_id)
            const user = kickUserIdToUser.get(kickUserId)
            if (!user) return

            const userId = Number(user.id)
            const points = userIdToPoints.get(userId) || 0

            userStatsMap.set(kickUserId, {
                points,
                messages: count._count.id,
                emotes: emotesMap.get(kickUserId) || 0,
                userId: user.id,
            })
        })

        // Add users with points but no messages (shouldn't happen, but be safe)
        ;(pointsByUser as Array<{ user_id: bigint; _sum: { sweet_coins_earned: number | null } }>).forEach((pt: any) => {
            const userId = Number(pt.user_id)
            const user = users.find(u => Number(u.id) === userId)
            if (!user) return

            const kickUserId = Number(user.kick_user_id)
            if (!userStatsMap.has(kickUserId)) {
                userStatsMap.set(kickUserId, {
                    points: pt._sum.sweet_coins_earned || 0,
                    messages: 0,
                    emotes: 0,
                    userId: user.id,
                })
            }
        })

        // Convert to array and sort
        const userStatsArray = Array.from(userStatsMap.values()) as Array<{ points: number; messages: number; emotes: number; userId: bigint }>
        userStatsArray.sort((a: { points: number; messages: number }, b: { points: number; messages: number }) => {
            if (b.points !== a.points) {
                return b.points - a.points
            }
            return b.messages - a.messages
        })

        // Calculate ranks
        const ranksArray: number[] = []
        let currentRank = 1
        for (let i = 0; i < userStatsArray.length; i++) {
            if (i === 0) {
                ranksArray.push(currentRank)
            } else {
                const prevEntry = userStatsArray[i - 1] as { points: number }
                const currEntry = userStatsArray[i] as { points: number }
                if (currEntry.points === prevEntry.points) {
                    ranksArray.push(ranksArray[i - 1])
                } else {
                    currentRank++
                    ranksArray.push(currentRank)
                }
            }
        }

        // Build leaderboard with user details
        // Create reverse map: userId -> kickUserId
        const userIdToKickUserId = new Map<bigint, number>()
        users.forEach(u => {
            userIdToKickUserId.set(u.id, Number(u.kick_user_id))
        })

        const leaderboard = userStatsArray.map((stats: { points: number; messages: number; emotes: number; userId: bigint }, index: number) => {
            const kickUserId = userIdToKickUserId.get(stats.userId)
            const user = kickUserId ? kickUserIdToUser.get(kickUserId) as any : null

            return {
                rank: ranksArray[index],
                user_id: stats.userId.toString(),
                kick_user_id: kickUserId?.toString() || '',
                username: user?.username || 'Unknown',
                profile_picture_url: rewriteApiMediaUrlToCdn(user?.custom_profile_picture_url || user?.profile_picture_url || null),
                points_earned: stats.points,
                messages_sent: stats.messages,
                emotes_used: stats.emotes,
            }
        })

        const result = {
            leaderboard,
            stats: {
                total_messages: totalMessages,
                total_points: totalPoints,
                unique_chatters: uniqueChatters,
            },
            session: {
                id: session.id,
                session_title: session.session_title,
                started_at: session.started_at,
                ended_at: session.ended_at,
            },
        }

        // Cache the result
        memoryCache.set(cacheKey, result, cacheTTL)

        // Log top 3 for monitoring - only when it changes
        if (result.leaderboard.length >= 3) {
            const top3Key = result.leaderboard.slice(0, 3)
                .map(e => `${e.username}:${e.points_earned}`)
                .join(',')
            const lastTop3Key = memoryCache.get<string>(`leaderboard-log:${session.id}`)

            if (top3Key !== lastTop3Key) {
                memoryCache.set(`leaderboard-log:${session.id}`, top3Key, 60000) // Remember for 1 minute
                logger.leaderboard(result.leaderboard.slice(0, 3).map(entry => ({
                    username: entry.username,
                    coins: entry.points_earned,
                })))
            }
        }

        const lastUpdated = Date.now()

        return NextResponse.json({
            leaderboard: result.leaderboard,
            session_id: session.id.toString(),
            session_title: session.session_title,
            started_at: session.started_at.toISOString(),
            ended_at: session.ended_at?.toISOString() || null,
            has_active_session: session.ended_at === null,
            stats: result.stats,
            last_updated: lastUpdated, // For client-side diffing
        }, {
            headers: {
                'Cache-Control': session.ended_at === null
                    ? 'no-cache, no-store, must-revalidate' // Real-time for active sessions
                    : 'public, max-age=30, stale-while-revalidate=60',
                'Last-Modified': new Date(lastUpdated).toUTCString(),
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
