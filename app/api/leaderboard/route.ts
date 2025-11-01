import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

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

        if (hasDateFilter && dateFilter) {
            // Calculate points for each user within date range
            usersWithPoints = await Promise.all(
                allUsers.map(async (user) => {
                    const pointHistory = await db.pointHistory.findMany({
                        where: {
                            user_id: user.id,
                            earned_at: dateFilter,
                        },
                        select: {
                            points_earned: true,
                        },
                    })
                    const calculatedPoints = pointHistory.reduce((sum, ph) => sum + ph.points_earned, 0)
                    return {
                        ...user,
                        _calculatedPoints: calculatedPoints,
                    }
                })
            )
        }

        // Sort users by points (descending), then by last login (descending)
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

            // Then by last login time (most recent first)
            const aLogin = a.last_login_at?.getTime() || 0
            const bLogin = b.last_login_at?.getTime() || 0
            return bLogin - aLogin
        })

        // Paginate after sorting
        const users = sortedUsers.slice(offset, offset + limit)

        // Get total count of all users
        const total = allUsers.length

        // Calculate additional stats for each user
        const formattedLeaderboard = await Promise.all(
            users.map(async (user, index) => {
                const kickUserId = user.kick_user_id

                // Calculate points based on date filter
                let totalPoints = 0
                let totalEmotes = 0
                let lastPointEarnedAt: Date | null = null

                if (hasDateFilter && dateFilter) {
                    // Get points from point history within date range
                    const pointHistory = await db.pointHistory.findMany({
                        where: {
                            user_id: user.id,
                            earned_at: dateFilter,
                        },
                        select: {
                            points_earned: true,
                            earned_at: true,
                        },
                    })

                    // Get emotes from messages within date range
                    // Exclude offline messages
                    const emotesResult = await db.chatMessage.findMany({
                        where: {
                            sender_user_id: kickUserId,
                            created_at: dateFilter,
                            sent_when_offline: false,
                        },
                        select: {
                            emotes: true,
                        },
                    })

                    // Filter messages that actually have emotes (not null/empty)
                    totalEmotes = emotesResult.filter(msg => {
                        const emotes = msg.emotes
                        return emotes !== null &&
                            emotes !== undefined &&
                            Array.isArray(emotes) &&
                            emotes.length > 0
                    }).length

                    totalPoints = pointHistory.reduce((sum, ph) => sum + ph.points_earned, 0)

                    const latestPoint = pointHistory.sort((a, b) =>
                        b.earned_at.getTime() - a.earned_at.getTime()
                    )[0]
                    lastPointEarnedAt = latestPoint?.earned_at || null
                } else {
                    // Use aggregated points from UserPoints table
                    const userPoints = user.points
                    totalPoints = userPoints?.total_points || 0
                    totalEmotes = userPoints?.total_emotes || 0
                    lastPointEarnedAt = userPoints?.last_point_earned_at || null
                }

                // Get total messages sent by this user (with date filter if applicable)
                // Exclude messages sent when offline
                const messageWhere: any = {
                    sender_user_id: kickUserId,
                    sent_when_offline: false,
                }
                if (hasDateFilter && dateFilter) {
                    messageWhere.created_at = dateFilter
                }

                const totalMessages = await db.chatMessage.count({
                    where: messageWhere,
                })

                // Get unique stream sessions watched (streams where user sent at least one message)
                // Filter by date range if applicable and exclude offline messages
                const streamWhere: any = {
                    sender_user_id: kickUserId,
                    stream_session_id: { not: null },
                    sent_when_offline: false,
                }
                if (hasDateFilter && dateFilter) {
                    streamWhere.created_at = dateFilter
                }

                const streamsWatchedResult = await db.chatMessage.groupBy({
                    by: ['stream_session_id'],
                    where: streamWhere,
                })

                const streamsWatched = streamsWatchedResult.length

                // Determine verification methods
                const hasKickLogin = !!user.last_login_at
                const hasDiscord = user.discord_connected || false
                const hasTelegram = user.telegram_connected || false

                // Determine if user is verified (has logged in at least once)
                const isVerified = hasKickLogin || hasDiscord || hasTelegram

                return {
                    rank: offset + index + 1,
                    user_id: user.id.toString(),
                    kick_user_id: kickUserId.toString(),
                    username: user.username,
                    profile_picture_url: user.custom_profile_picture_url || user.profile_picture_url,
                    total_points: totalPoints,
                    total_emotes: totalEmotes,
                    total_messages: totalMessages || 0,
                    streams_watched: streamsWatched || 0,
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
        )

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
