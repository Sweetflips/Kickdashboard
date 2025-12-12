import { NextResponse } from 'next/server'
import { isAdmin } from '@/lib/auth'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

type DailyActivity = { date: string; messages: number; emotes: number }

export async function GET(request: Request) {
    try {
        const adminCheck = await isAdmin(request)
        if (!adminCheck) {
            return NextResponse.json({ error: 'Unauthorized - Admin access required' }, { status: 403 })
        }

        const { searchParams } = new URL(request.url)
        const topUsersLimit = Math.max(1, Math.min(100, parseInt(searchParams.get('topUsersLimit') || '50', 10) || 50))

        const [
            totalMessages,
            totalUsers,
            totalPointsAgg,
            totalEmotesAgg,
            messagesWithEmotes,
            endedStreamsCount,
            endedStreamsViewsAgg,
        ] = await Promise.all([
            db.chatMessage.count(),
            db.user.count(),
            db.userSweetCoins.aggregate({ _sum: { total_sweet_coins: true } }),
            db.userSweetCoins.aggregate({ _sum: { total_emotes: true } }),
            db.chatMessage.count({ where: { has_emotes: true } }),
            db.streamSession.count({ where: { ended_at: { not: null } } }),
            db.streamSession.aggregate({ where: { ended_at: { not: null } }, _sum: { peak_viewer_count: true } }),
        ])

        const activity_types = {
            messages: totalMessages,
            messages_with_emotes: messagesWithEmotes,
            messages_with_text_only: totalMessages - messagesWithEmotes,
            emotes: totalEmotesAgg._sum.total_emotes || 0,
        }

        // Engagement breakdown (all messages)
        const [engagementCounts, engagementLenAgg] = await Promise.all([
            db.chatMessage.groupBy({
                by: ['engagement_type'],
                _count: { _all: true },
            }),
            db.chatMessage.aggregate({
                _avg: { message_length: true },
                _max: { message_length: true },
                _count: { _all: true },
            }),
        ])

        const engagement_types: Record<string, number> = {}
        for (const row of engagementCounts) {
            engagement_types[row.engagement_type] = row._count._all
        }

        const avg_message_length = engagementLenAgg._avg.message_length ? Number(engagementLenAgg._avg.message_length.toFixed(1)) : 0

        // Daily activity (last 30 days) via SQL aggregation (avoid fetching rows)
        const daily_activity: DailyActivity[] = await db.$queryRaw<
            Array<{ day: Date; messages: bigint; emotes: bigint }>
        >`
            SELECT
                date_trunc('day', created_at) AS day,
                COUNT(*)::bigint AS messages,
                SUM(CASE WHEN has_emotes THEN 1 ELSE 0 END)::bigint AS emotes
            FROM chat_messages
            WHERE created_at >= NOW() - INTERVAL '30 days'
            GROUP BY 1
            ORDER BY 1 ASC
        `.then(rows =>
            rows.map(r => ({
                date: r.day.toISOString().slice(0, 10),
                messages: Number(r.messages),
                emotes: Number(r.emotes),
            }))
        )

        // Stream performance (recent ended streams)
        const recentStreams = await db.streamSession.findMany({
            where: { ended_at: { not: null } },
            orderBy: { started_at: 'desc' },
            take: 100,
            select: {
                started_at: true,
                total_messages: true,
                peak_viewer_count: true,
                session_title: true,
            },
        })

        const streamsTotalMessages = recentStreams.reduce((sum, s) => sum + (s.total_messages || 0), 0)
        const streamsTotalViewers = recentStreams.reduce((sum, s) => sum + (s.peak_viewer_count || 0), 0)
        const avg_messages_per_stream = recentStreams.length ? Number((streamsTotalMessages / recentStreams.length).toFixed(2)) : 0
        const avg_viewers_per_stream = recentStreams.length ? Number((streamsTotalViewers / recentStreams.length).toFixed(2)) : 0
        const engagement_rate = streamsTotalViewers > 0 ? Number((totalMessages / streamsTotalViewers).toFixed(2)) : 0
        const avg_messages_per_user = totalUsers > 0 ? Number((totalMessages / totalUsers).toFixed(2)) : 0

        const top_streams = [...recentStreams]
            .sort((a, b) => (b.total_messages || 0) - (a.total_messages || 0))
            .slice(0, 5)
            .map((s, idx) => ({
                rank: idx + 1,
                messages: s.total_messages || 0,
                viewers: s.peak_viewer_count || 0,
                date: s.started_at.toISOString().slice(0, 10),
                title: s.session_title || 'Untitled Stream',
            }))

        // Top users (fast, no per-user full scans)
        const topUsers = await db.userSweetCoins.findMany({
            orderBy: { total_sweet_coins: 'desc' },
            take: topUsersLimit,
            include: {
                user: {
                    select: {
                        kick_user_id: true,
                        username: true,
                        profile_picture_url: true,
                        custom_profile_picture_url: true,
                    },
                },
            },
        })

        const kickUserIds = topUsers.map(u => u.user.kick_user_id)

        const [msgCounts, msgWithEmotesCounts, engagementByUserType, lenAggByUser, streamsByUserSession] = await Promise.all([
            db.chatMessage.groupBy({
                by: ['sender_user_id'],
                where: { sender_user_id: { in: kickUserIds }, sent_when_offline: false },
                _count: { _all: true },
            }),
            db.chatMessage.groupBy({
                by: ['sender_user_id'],
                where: { sender_user_id: { in: kickUserIds }, sent_when_offline: false, has_emotes: true },
                _count: { _all: true },
            }),
            db.chatMessage.groupBy({
                by: ['sender_user_id', 'engagement_type'],
                where: { sender_user_id: { in: kickUserIds }, sent_when_offline: false },
                _count: { _all: true },
            }),
            db.chatMessage.groupBy({
                by: ['sender_user_id'],
                where: { sender_user_id: { in: kickUserIds }, sent_when_offline: false },
                _avg: { message_length: true },
                _max: { message_length: true },
                _count: { _all: true },
            }),
            db.chatMessage.groupBy({
                by: ['sender_user_id', 'stream_session_id'],
                where: { sender_user_id: { in: kickUserIds }, sent_when_offline: false, stream_session_id: { not: null } },
            }),
        ])

        const messagesMap = new Map<string, number>()
        for (const row of msgCounts) messagesMap.set(row.sender_user_id.toString(), row._count._all)

        const messagesWithEmotesMap = new Map<string, number>()
        for (const row of msgWithEmotesCounts) messagesWithEmotesMap.set(row.sender_user_id.toString(), row._count._all)

        const engagementMap = new Map<string, Record<string, number>>()
        for (const row of engagementByUserType) {
            const key = row.sender_user_id.toString()
            if (!engagementMap.has(key)) engagementMap.set(key, {})
            const obj = engagementMap.get(key)!
            obj[row.engagement_type] = (obj[row.engagement_type] || 0) + row._count._all
        }

        const lenAggMap = new Map<string, { avg: number; max: number; total: number }>()
        for (const row of lenAggByUser) {
            lenAggMap.set(row.sender_user_id.toString(), {
                avg: row._avg.message_length ? Number(row._avg.message_length.toFixed(1)) : 0,
                max: row._max.message_length || 0,
                total: row._count._all,
            })
        }

        const streamsSetByUser = new Map<string, Set<string>>()
        for (const row of streamsByUserSession) {
            const key = row.sender_user_id.toString()
            if (!streamsSetByUser.has(key)) streamsSetByUser.set(key, new Set())
            if (row.stream_session_id) streamsSetByUser.get(key)!.add(row.stream_session_id.toString())
        }

        const users = topUsers
            .map((entry, idx) => {
                const kickUserId = entry.user.kick_user_id
                const key = kickUserId.toString()

                const totalMessagesForUser = messagesMap.get(key) || 0
                const messagesWithEmotesForUser = messagesWithEmotesMap.get(key) || 0
                const streamsWatched = streamsSetByUser.get(key)?.size || 0

                const lenAgg = lenAggMap.get(key) || { avg: 0, max: 0, total: 0 }

                const activityBreakdown = {
                    messages: totalMessagesForUser,
                    emotes: entry.total_emotes || 0,
                    messages_with_emotes: messagesWithEmotesForUser,
                    sweet_coins: entry.total_sweet_coins || 0,
                    streams_watched: streamsWatched,
                    avg_sweet_coins_per_stream: streamsWatched > 0 ? Number(((entry.total_sweet_coins || 0) / streamsWatched).toFixed(2)) : 0,
                    avg_messages_per_stream: streamsWatched > 0 ? Number((totalMessagesForUser / streamsWatched).toFixed(2)) : 0,
                }

                const engagement_types_for_user = engagementMap.get(key) || {}

                const activityScore =
                    (activityBreakdown.sweet_coins * 2) +
                    (activityBreakdown.messages * 1) +
                    (activityBreakdown.emotes * 0.5) +
                    (activityBreakdown.streams_watched * 10)

                return {
                    rank: idx + 1,
                    username: entry.user.username,
                    profile_picture_url: entry.user.custom_profile_picture_url || entry.user.profile_picture_url,
                    total_sweet_coins: activityBreakdown.sweet_coins,
                    total_emotes: activityBreakdown.emotes,
                    activity_breakdown: activityBreakdown,
                    engagement_breakdown: {
                        engagement_types: engagement_types_for_user,
                        avg_message_length: lenAgg.avg,
                        longest_message: lenAgg.max,
                        total_messages_analyzed: lenAgg.total,
                    },
                    activity_score: Math.round(activityScore),
                    last_sweet_coin_earned_at: entry.last_sweet_coin_earned_at?.toISOString() || null,
                }
            })
            .sort((a, b) => b.activity_score - a.activity_score)
            .map((u, i) => ({ ...u, rank: i + 1 }))

        return NextResponse.json({
            users,
            overall_stats: {
                total_messages: totalMessages,
                total_sweet_coins: totalPointsAgg._sum.total_sweet_coins || 0,
                activity_types,
                engagement_types,
                avg_message_length,
                daily_activity,
                performance_metrics: {
                    avg_messages_per_stream,
                    avg_viewers_per_stream,
                    engagement_rate,
                    avg_messages_per_user,
                    total_streams_analyzed: recentStreams.length,
                },
                top_streams,
            },
            totals: {
                total_views: endedStreamsViewsAgg._sum.peak_viewer_count || 0,
                total_streams: endedStreamsCount,
                total_users: totalUsers,
            },
        })
    } catch (error) {
        console.error('Error fetching admin analytics summary:', error)
        return NextResponse.json(
            { error: 'Failed to fetch analytics summary', details: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        )
    }
}
