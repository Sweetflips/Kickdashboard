import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url)
        const limit = parseInt(searchParams.get('limit') || '50')
        const offset = parseInt(searchParams.get('offset') || '0')

        // Date filtering
        const startDate = searchParams.get('startDate')
        const endDate = searchParams.get('endDate')
        const hasDateFilter = startDate && endDate

        let dateFilter: { gte?: Date; lte?: Date } | undefined
        if (hasDateFilter) {
            // Parse dates as UTC by appending 'T00:00:00Z' to ensure UTC timezone
            const start = new Date(startDate + 'T00:00:00.000Z')
            const end = new Date(endDate + 'T23:59:59.999Z')
            dateFilter = {
                gte: start,
                lte: end,
            }
        }

        // Get all users - include their points relation
        const allUsers = await db.user.findMany({
            include: {
                points: true,
            },
        })

        // Calculate points for sorting (needs to be done before sorting when date filter is applied)
        let usersWithPoints = allUsers
        let userPointsMap: Map<number, number> = new Map()

        if (hasDateFilter && dateFilter) {
            // Batch query all point history with aggregation
            const pointHistoryAggregates = await db.pointHistory.groupBy({
                by: ['user_id'],
                where: {
                    earned_at: dateFilter,
                },
                _sum: {
                    points_earned: true,
                },
            })

            // Create map for quick lookup
            pointHistoryAggregates.forEach((agg) => {
                userPointsMap.set(Number(agg.user_id), agg._sum.points_earned || 0)
            })

            // Add calculated points to users
            usersWithPoints = allUsers.map((user) => ({
                ...user,
                _calculatedPoints: userPointsMap.get(Number(user.id)) || 0,
            }))
        }

        // Sort users by points (descending), then by messages (descending)
        const sortedUsers = usersWithPoints.sort((a, b) => {
            const aPoints = hasDateFilter && dateFilter
                ? (a as any)._calculatedPoints || 0
                : a.points?.total_points || 0
            const bPoints = hasDateFilter && dateFilter
                ? (b as any)._calculatedPoints || 0
                : b.points?.total_points || 0

            // First sort by points
            if (bPoints !== aPoints) {
                return bPoints - aPoints
            }

            // Then by message count (will be resolved after batch query)
            // For now, fallback to last login as initial sort - will re-sort after getting messages
            const aLogin = a.last_login_at?.getTime() || 0
            const bLogin = b.last_login_at?.getTime() || 0
            return bLogin - aLogin
        })

        // Paginate after sorting
        const users = sortedUsers.slice(offset, offset + limit)

        // Get total count of all users
        const total = allUsers.length

        // Batch fetch all stats for paginated users to avoid connection exhaustion
        const kickUserIds = users.map(u => Number(u.kick_user_id))
        const userIds = users.map(u => Number(u.id))

        // Batch fetch all aggregated stats
        let pointsMap: Map<number, number> = new Map()
        let emotesMap: Map<number, number> = new Map()
        let messagesMap: Map<number, number> = new Map()
        let streamsMap: Map<number, number> = new Map()
        let lastPointEarnedMap: Map<number, Date | null> = new Map()

        if (hasDateFilter && dateFilter) {
            // Batch query point history aggregates
            const pointAggregates = await db.pointHistory.groupBy({
                by: ['user_id'],
                where: {
                    user_id: { in: userIds },
                    earned_at: dateFilter,
                },
                _sum: {
                    points_earned: true,
                },
                _max: {
                    earned_at: true,
                },
            })

            pointAggregates.forEach((agg) => {
                pointsMap.set(Number(agg.user_id), agg._sum.points_earned || 0)
                lastPointEarnedMap.set(Number(agg.user_id), agg._max.earned_at || null)
            })

            // Batch query emotes count (messages with emotes)
            // Note: Can't filter JSON fields directly, so fetch all and filter in code
            const emotesQuery = await db.chatMessage.findMany({
                where: {
                    sender_user_id: { in: kickUserIds },
                    created_at: dateFilter,
                    sent_when_offline: false,
                },
                select: {
                    sender_user_id: true,
                    emotes: true,
                },
            })

            // Group by user and count messages with non-empty emotes
            const emotesByUser = new Map<number, number>()
            emotesQuery.forEach((msg) => {
                const kickUserId = Number(msg.sender_user_id)
                const emotes = msg.emotes
                if (emotes && Array.isArray(emotes) && emotes.length > 0) {
                    emotesByUser.set(kickUserId, (emotesByUser.get(kickUserId) || 0) + 1)
                }
            })
            emotesMap = emotesByUser

            // Batch query message counts
            const messageCounts = await db.chatMessage.groupBy({
                by: ['sender_user_id'],
                where: {
                    sender_user_id: { in: kickUserIds },
                    created_at: dateFilter,
                    sent_when_offline: false,
                },
                _count: {
                    id: true,
                },
            })

            messageCounts.forEach((count) => {
                messagesMap.set(Number(count.sender_user_id), Number(count._count.id))
            })

            // Batch query streams watched
            const streamsWatched = await db.chatMessage.groupBy({
                by: ['sender_user_id', 'stream_session_id'],
                where: {
                    sender_user_id: { in: kickUserIds },
                    created_at: dateFilter,
                    stream_session_id: { not: null },
                    sent_when_offline: false,
                },
            })

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
        } else {
            // For non-filtered, use pre-aggregated data from UserPoints
            users.forEach((user) => {
                const userPoints = user.points
                pointsMap.set(Number(user.id), userPoints?.total_points || 0)
                emotesMap.set(Number(user.kick_user_id), userPoints?.total_emotes || 0)
                lastPointEarnedMap.set(Number(user.id), userPoints?.last_point_earned_at || null)
            })

            // Batch query message counts
            const messageCounts = await db.chatMessage.groupBy({
                by: ['sender_user_id'],
                where: {
                    sender_user_id: { in: kickUserIds },
                    sent_when_offline: false,
                },
                _count: {
                    id: true,
                },
            })

            messageCounts.forEach((count) => {
                messagesMap.set(Number(count.sender_user_id), Number(count._count.id))
            })

            // Batch query streams watched
            const streamsWatched = await db.chatMessage.groupBy({
                by: ['sender_user_id', 'stream_session_id'],
                where: {
                    sender_user_id: { in: kickUserIds },
                    stream_session_id: { not: null },
                    sent_when_offline: false,
                },
            })

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
        }

        // Now re-sort by points, then messages
        const sortedFormatted = users
            .map((user, index) => {
                const kickUserId = Number(user.kick_user_id)
                const userId = Number(user.id)

                const totalPoints = hasDateFilter && dateFilter
                    ? (pointsMap.get(userId) || 0)
                    : (user.points?.total_points || 0)

                const totalMessages = messagesMap.get(kickUserId) || 0

                return { user, userId, kickUserId, totalPoints, totalMessages }
            })
            .sort((a, b) => {
                // Primary: Points (descending)
                if (b.totalPoints !== a.totalPoints) {
                    return b.totalPoints - a.totalPoints
                }
                // Secondary: Messages (descending)
                return b.totalMessages - a.totalMessages
            })

        // Calculate shared ranks (dense ranking)
        // Users with the same points share the same rank, next rank is consecutive (1,1,2 not 1,1,3)
        const ranksMap = new Map<number, number>()
        let currentRank = offset + 1
        for (let i = 0; i < sortedFormatted.length; i++) {
            const item = sortedFormatted[i]
            if (i === 0) {
                ranksMap.set(i, currentRank)
            } else {
                const prevItem = sortedFormatted[i - 1]
                if (item.totalPoints === prevItem.totalPoints) {
                    // Same points = same rank
                    ranksMap.set(i, ranksMap.get(i - 1)!)
                } else {
                    // Different points = next consecutive rank
                    currentRank++
                    ranksMap.set(i, currentRank)
                }
            }
        }

        // Build formatted leaderboard from sorted data
        const formattedLeaderboard = sortedFormatted.map((item, index) => {
            const { user, userId, kickUserId, totalPoints, totalMessages } = item

            const totalEmotes = hasDateFilter && dateFilter
                ? (emotesMap.get(kickUserId) || 0)
                : (user.points?.total_emotes || 0)

            const lastPointEarnedAt = hasDateFilter && dateFilter
                ? (lastPointEarnedMap.get(userId) || null)
                : (user.points?.last_point_earned_at || null)

            const streamsWatched = streamsMap.get(kickUserId) || 0

            // Determine verification methods
            const hasKickLogin = !!user.last_login_at
            const hasDiscord = user.discord_connected || false
            const hasTelegram = user.telegram_connected || false
            const isVerified = hasKickLogin || hasDiscord || hasTelegram

            return {
                rank: ranksMap.get(index) || (offset + index + 1),
                user_id: userId.toString(),
                kick_user_id: kickUserId.toString(),
                username: user.username,
                profile_picture_url: user.custom_profile_picture_url || user.profile_picture_url,
                total_points: totalPoints,
                total_emotes: totalEmotes,
                total_messages: totalMessages,
                streams_watched: streamsWatched,
                last_point_earned_at: lastPointEarnedAt?.toISOString() || null,
                is_verified: isVerified,
                last_login_at: user.last_login_at?.toISOString() || null,
                verification_methods: {
                    kick: hasKickLogin,
                    discord: hasDiscord,
                    telegram: hasTelegram,
                },
            }
        })

        return NextResponse.json({
            leaderboard: formattedLeaderboard,
            total,
            limit,
            offset,
        })
    } catch (error) {
        console.error('Error fetching leaderboard:', error)
        return NextResponse.json(
            { error: 'Failed to fetch leaderboard', details: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        )
    }
}
