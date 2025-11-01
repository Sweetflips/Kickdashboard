import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url)
        const limit = parseInt(searchParams.get('limit') || '50')
        const offset = parseInt(searchParams.get('offset') || '0')

        const [leaderboard, total] = await Promise.all([
            db.userPoints.findMany({
                orderBy: { total_points: 'desc' },
                take: limit,
                skip: offset,
                include: {
                    user: {
                        select: {
                            kick_user_id: true,
                            username: true,
                            profile_picture_url: true,
                            custom_profile_picture_url: true,
                            last_login_at: true,
                            discord_connected: true,
                            telegram_connected: true,
                            kick_connected: true,
                        },
                    },
                },
            }),
            db.userPoints.count(),
        ])

        // Calculate additional stats for each user
        const formattedLeaderboard = await Promise.all(
            leaderboard.map(async (entry, index) => {
                const kickUserId = entry.user.kick_user_id

                // Get total messages sent by this user
                const totalMessages = await db.chatMessage.count({
                    where: {
                        sender_user_id: kickUserId,
                    },
                })

                // Get unique stream sessions watched (streams where user sent at least one message)
                // Use groupBy to get distinct stream_session_ids
                const streamsWatchedResult = await db.chatMessage.groupBy({
                    by: ['stream_session_id'],
                    where: {
                        sender_user_id: kickUserId,
                        stream_session_id: { not: null },
                    },
                })

                const streamsWatched = streamsWatchedResult.length

                // Determine if user is verified (has logged in at least once)
                const isVerified = !!entry.user.last_login_at ||
                                   entry.user.discord_connected ||
                                   entry.user.telegram_connected ||
                                   entry.user.kick_connected

                return {
                    rank: offset + index + 1,
                    user_id: entry.user_id.toString(),
                    kick_user_id: kickUserId.toString(),
                    username: entry.user.username,
                    profile_picture_url: entry.user.custom_profile_picture_url || entry.user.profile_picture_url,
                    total_points: entry.total_points || 0,
                    total_emotes: entry.total_emotes || 0,
                    total_messages: totalMessages || 0,
                    streams_watched: streamsWatched || 0,
                    last_point_earned_at: entry.last_point_earned_at?.toISOString() || null,
                    is_verified: isVerified,
                    last_login_at: entry.user.last_login_at?.toISOString() || null,
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
