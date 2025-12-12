import { db } from '@/lib/db'
import { memoryCache } from '@/lib/memory-cache'
import { NextResponse } from 'next/server'

// Allow caching but revalidate frequently for fresh data
export const dynamic = 'force-dynamic'
export const revalidate = 15 // Revalidate every 15 seconds

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url)
        const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100) // Cap at 100
        const offset = parseInt(searchParams.get('offset') || '0')

        // Date filtering
        const startDate = searchParams.get('startDate')
        const endDate = searchParams.get('endDate')
        const hasDateFilter = startDate && endDate

        let dateFilter: { gte: Date; lte: Date } | null = null
        if (hasDateFilter) {
            const start = new Date(startDate + 'T00:00:00.000Z')
            const end = new Date(endDate + 'T23:59:59.999Z')
            dateFilter = { gte: start, lte: end }
        }

        // Cache key includes all parameters
        const cacheKey = `leaderboard:${limit}:${offset}:${startDate || 'all'}:${endDate || 'all'}`
        const cacheTTL = hasDateFilter ? 30000 : 15000 // 30s for date-filtered, 15s for overall

        // Try cache first
        const cached = memoryCache.get<{
            leaderboard: any[]
            total: number
        }>(cacheKey)

        if (cached) {
            return NextResponse.json({
                leaderboard: cached.leaderboard,
                total: cached.total,
                limit,
                offset,
            }, {
                headers: {
                    'Cache-Control': 'public, max-age=15, stale-while-revalidate=30',
                },
            })
        }

        // Fetch data with caching wrapper
        const result = await memoryCache.getOrSet(
            cacheKey,
            async () => {
                if (hasDateFilter && dateFilter) {
                    return await fetchDateFilteredLeaderboard(limit, offset, dateFilter)
                } else {
                    return await fetchOverallLeaderboard(limit, offset)
                }
            },
            cacheTTL
        )

        return NextResponse.json({
            leaderboard: result.leaderboard,
            total: result.total,
            limit,
            offset,
        }, {
            headers: {
                'Cache-Control': 'public, max-age=15, stale-while-revalidate=30',
            },
        })
    } catch (error) {
        console.error('Error fetching leaderboard:', error)
        return NextResponse.json(
            { error: 'Failed to fetch leaderboard', details: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        )
    }
}

/**
 * Fetch overall leaderboard (no date filter) - use UserPoints table
 */
async function fetchOverallLeaderboard(limit: number, offset: number) {
    // Get total count
    const total = await db.userPoints.count()

    // Get paginated users ordered by total_points DESC
    // Join with User table to get user details
    const userPoints = await db.userPoints.findMany({
        orderBy: {
            total_points: 'desc',
        },
        skip: offset,
        take: limit,
        include: {
            user: {
                select: {
                    id: true,
                    kick_user_id: true,
                    username: true,
                    profile_picture_url: true,
                    custom_profile_picture_url: true,
                    last_login_at: true,
                    discord_connected: true,
                    telegram_connected: true,
                },
            },
        },
    })

    // Get kick_user_ids for batch message/stream queries
    const kickUserIds = userPoints.map(up => Number(up.user.kick_user_id))
    const userIds = userPoints.map(up => Number(up.user_id))

    // Batch fetch message counts and streams watched
    const [messageCounts, streamsWatched] = await Promise.all([
        db.chatMessage.groupBy({
            by: ['sender_user_id'],
            where: {
                sender_user_id: { in: kickUserIds },
                sent_when_offline: false,
            },
            _count: {
                id: true,
            },
        }),
        db.chatMessage.groupBy({
            by: ['sender_user_id', 'stream_session_id'],
            where: {
                sender_user_id: { in: kickUserIds },
                stream_session_id: { not: null },
                sent_when_offline: false,
            },
        }),
    ])

    // Build maps
    const messagesMap = new Map<number, number>()
    messageCounts.forEach((count) => {
        messagesMap.set(Number(count.sender_user_id), Number(count._count.id))
    })

    const streamsMap = new Map<number, number>()
    const streamsByUser = new Map<number, Set<number>>()
    streamsWatched.forEach((stream) => {
        const kickUserId = Number(stream.sender_user_id)
        const sessionId = stream.stream_session_id ? Number(stream.stream_session_id) : null
        if (sessionId) {
            if (!streamsByUser.has(kickUserId)) {
                streamsByUser.set(kickUserId, new Set())
            }
            streamsByUser.get(kickUserId)!.add(sessionId)
        }
    })
    streamsByUser.forEach((sessionSet, kickUserId) => {
        streamsMap.set(kickUserId, sessionSet.size)
    })

    // Build leaderboard entries
    const leaderboard = userPoints.map((up, index) => {
        const user = up.user
        const kickUserId = Number(user.kick_user_id)
        const userId = Number(user.id)

        const hasKickLogin = !!user.last_login_at
        const hasDiscord = user.discord_connected || false
        const hasTelegram = user.telegram_connected || false

        return {
            rank: offset + index + 1,
            user_id: userId.toString(),
            kick_user_id: kickUserId.toString(),
            username: user.username,
            profile_picture_url: user.custom_profile_picture_url || user.profile_picture_url,
            total_points: up.total_points,
            total_emotes: up.total_emotes,
            total_messages: messagesMap.get(kickUserId) || 0,
            streams_watched: streamsMap.get(kickUserId) || 0,
            last_point_earned_at: up.last_point_earned_at?.toISOString() || null,
            is_verified: hasKickLogin || hasDiscord || hasTelegram,
            last_login_at: user.last_login_at?.toISOString() || null,
            verification_methods: {
                kick: hasKickLogin,
                discord: hasDiscord,
                telegram: hasTelegram,
            },
        }
    })

    return { leaderboard, total }
}

/**
 * Fetch date-filtered leaderboard - aggregate from pointHistory
 */
async function fetchDateFilteredLeaderboard(
    limit: number,
    offset: number,
    dateFilter: { gte: Date; lte: Date }
) {
    // Get total users who earned points in this period
    const totalAggregates = await db.pointHistory.groupBy({
        by: ['user_id'],
        where: {
            earned_at: dateFilter,
        },
    })
    const total = totalAggregates.length

    // Get top users by points earned in this period (paginated)
    // Note: Prisma groupBy doesn't support orderBy on aggregated fields directly
    // So we need to fetch more and sort in memory, or use raw SQL
    // For now, fetch all aggregates, sort, then paginate
    const pointAggregates = await db.pointHistory.groupBy({
        by: ['user_id'],
        where: {
            earned_at: dateFilter,
        },
        _sum: {
            points_earned: true,
        },
        _max: {
            earned_at: true,
        },
    })

    // Sort by points descending
    pointAggregates.sort((a, b) => {
        const aPoints = a._sum.points_earned || 0
        const bPoints = b._sum.points_earned || 0
        return bPoints - aPoints
    })

    // Paginate
    const paginatedAggregates = pointAggregates.slice(offset, offset + limit)
    const userIds = paginatedAggregates.map(agg => Number(agg.user_id))

    // Get user details
    const users = await db.user.findMany({
        where: {
            id: { in: userIds },
        },
        select: {
            id: true,
            kick_user_id: true,
            username: true,
            profile_picture_url: true,
            custom_profile_picture_url: true,
            last_login_at: true,
            discord_connected: true,
            telegram_connected: true,
        },
    })

    const userMap = new Map(users.map(u => [Number(u.id), u]))
    const kickUserIds = users.map(u => Number(u.kick_user_id))

    // Batch fetch stats for these users
    const [messageCounts, streamsWatched, emotesQuery] = await Promise.all([
        db.chatMessage.groupBy({
            by: ['sender_user_id'],
            where: {
                sender_user_id: { in: kickUserIds },
                created_at: dateFilter,
                sent_when_offline: false,
            },
            _count: {
                id: true,
            },
        }),
        db.chatMessage.groupBy({
            by: ['sender_user_id', 'stream_session_id'],
            where: {
                sender_user_id: { in: kickUserIds },
                created_at: dateFilter,
                stream_session_id: { not: null },
                sent_when_offline: false,
            },
        }),
        db.chatMessage.findMany({
            where: {
                sender_user_id: { in: kickUserIds },
                created_at: dateFilter,
                sent_when_offline: false,
            },
            select: {
                sender_user_id: true,
                emotes: true,
            },
        }),
    ])

    // Build maps
    const pointsMap = new Map<number, number>()
    const lastPointEarnedMap = new Map<number, Date | null>()
    paginatedAggregates.forEach((agg) => {
        const userId = Number(agg.user_id)
        pointsMap.set(userId, agg._sum.points_earned || 0)
        lastPointEarnedMap.set(userId, agg._max.earned_at || null)
    })

    const messagesMap = new Map<number, number>()
    messageCounts.forEach((count) => {
        messagesMap.set(Number(count.sender_user_id), Number(count._count.id))
    })

    const emotesMap = new Map<number, number>()
    emotesQuery.forEach((msg) => {
        const kickUserId = Number(msg.sender_user_id)
        const emotes = msg.emotes
        if (emotes && Array.isArray(emotes) && emotes.length > 0) {
            emotesMap.set(kickUserId, (emotesMap.get(kickUserId) || 0) + 1)
        }
    })

    const streamsMap = new Map<number, number>()
    const streamsByUser = new Map<number, Set<number>>()
    streamsWatched.forEach((stream) => {
        const kickUserId = Number(stream.sender_user_id)
        const sessionId = stream.stream_session_id ? Number(stream.stream_session_id) : null
        if (sessionId) {
            if (!streamsByUser.has(kickUserId)) {
                streamsByUser.set(kickUserId, new Set())
            }
            streamsByUser.get(kickUserId)!.add(sessionId)
        }
    })
    streamsByUser.forEach((sessionSet, kickUserId) => {
        streamsMap.set(kickUserId, sessionSet.size)
    })

    // Build leaderboard entries maintaining sort order
    const leaderboard = paginatedAggregates.map((agg, index) => {
        const userId = Number(agg.user_id)
        const user = userMap.get(userId)
        if (!user) {
            // User not found, skip
            return null
        }

        const kickUserId = Number(user.kick_user_id)
        const hasKickLogin = !!user.last_login_at
        const hasDiscord = user.discord_connected || false
        const hasTelegram = user.telegram_connected || false

        return {
            rank: offset + index + 1,
            user_id: userId.toString(),
            kick_user_id: kickUserId.toString(),
            username: user.username,
            profile_picture_url: user.custom_profile_picture_url || user.profile_picture_url,
            total_points: pointsMap.get(userId) || 0,
            total_emotes: emotesMap.get(kickUserId) || 0,
            total_messages: messagesMap.get(kickUserId) || 0,
            streams_watched: streamsMap.get(kickUserId) || 0,
            last_point_earned_at: lastPointEarnedMap.get(userId)?.toISOString() || null,
            is_verified: hasKickLogin || hasDiscord || hasTelegram,
            last_login_at: user.last_login_at?.toISOString() || null,
            verification_methods: {
                kick: hasKickLogin,
                discord: hasDiscord,
                telegram: hasTelegram,
            },
        }
    }).filter(Boolean) as any[]

    return { leaderboard, total }
}
