import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url)
        const limit = parseInt(searchParams.get('limit') || '50')
        const offset = parseInt(searchParams.get('offset') || '0')

        // Get all users who have logged in (have last_login_at or connected accounts)
        // Include their points relation
        const allUsers = await db.user.findMany({
            where: {
                OR: [
                    { last_login_at: { not: null } },
                    { discord_connected: true },
                    { telegram_connected: true },
                ],
            },
            include: {
                points: true,
            },
        })

        // Sort users by points (descending), then by last login (descending)
        const sortedUsers = allUsers.sort((a, b) => {
            const aPoints = a.points?.total_points || 0
            const bPoints = b.points?.total_points || 0
            
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

        // Get total count of users who have logged in
        const total = allUsers.length

        // Calculate additional stats for each user
        const formattedLeaderboard = await Promise.all(
            users.map(async (user, index) => {
                const kickUserId = user.kick_user_id
                const userPoints = user.points

                // Get total messages sent by this user
                const totalMessages = await db.chatMessage.count({
                    where: {
                        sender_user_id: kickUserId,
                    },
                })

                // Get unique stream sessions watched (streams where user sent at least one message)
                const streamsWatchedResult = await db.chatMessage.groupBy({
                    by: ['stream_session_id'],
                    where: {
                        sender_user_id: kickUserId,
                        stream_session_id: { not: null },
                    },
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
                    total_points: userPoints?.total_points || 0,
                    total_emotes: userPoints?.total_emotes || 0,
                    total_messages: totalMessages || 0,
                    streams_watched: streamsWatched || 0,
                    last_point_earned_at: userPoints?.last_point_earned_at?.toISOString() || null,
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
