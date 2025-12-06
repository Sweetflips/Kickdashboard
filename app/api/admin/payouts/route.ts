import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { isAdmin } from '@/lib/auth'

export async function GET(request: Request) {
    try {
        // Check admin access
        const adminCheck = await isAdmin(request)
        if (!adminCheck) {
            return NextResponse.json(
                { error: 'Unauthorized - Admin access required' },
                { status: 403 }
            )
        }

        const { searchParams } = new URL(request.url)
        const streamSessionId = searchParams.get('stream_session_id')
        const budget = parseFloat(searchParams.get('budget') || '100')
        const roundTo = parseInt(searchParams.get('round_to') || '2')
        const topN = searchParams.get('top_n') ? parseInt(searchParams.get('top_n')!) : null // null = all participants

        if (!streamSessionId) {
            return NextResponse.json(
                { error: 'stream_session_id is required' },
                { status: 400 }
            )
        }

        if (isNaN(budget) || budget <= 0) {
            return NextResponse.json(
                { error: 'budget must be a positive number' },
                { status: 400 }
            )
        }

        // Get stream session info
        const streamSession = await db.streamSession.findUnique({
            where: { id: BigInt(streamSessionId) },
            include: {
                broadcaster: {
                    select: {
                        username: true,
                        profile_picture_url: true,
                    },
                },
            },
        })

        if (!streamSession) {
            return NextResponse.json(
                { error: 'Stream session not found' },
                { status: 404 }
            )
        }

        // Get all points earned in this stream session, grouped by user
        const pointsByUser = await db.pointHistory.groupBy({
            by: ['user_id'],
            where: {
                stream_session_id: BigInt(streamSessionId),
            },
            _sum: {
                points_earned: true,
            },
        })

        if (pointsByUser.length === 0) {
            return NextResponse.json({
                stream_session: {
                    id: streamSession.id.toString(),
                    session_title: streamSession.session_title,
                    channel_slug: streamSession.channel_slug,
                    started_at: streamSession.started_at.toISOString(),
                    ended_at: streamSession.ended_at?.toISOString() || null,
                    broadcaster: streamSession.broadcaster,
                },
                payouts: [],
                summary: {
                    total_points: 0,
                    dollar_per_point: 0,
                    total_payout: 0,
                    budget,
                    participant_count: 0,
                },
            })
        }

        // Get user details for all participants
        const userIds = pointsByUser.map(p => p.user_id)
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
            },
        })

        const userMap = new Map(users.map(u => [u.id.toString(), u]))

        // Build initial sorted list by points
        const sortedByPoints = pointsByUser
            .map(p => ({
                user_id: p.user_id,
                points: p._sum.points_earned || 0,
            }))
            .sort((a, b) => b.points - a.points)

        // Apply top N filter if specified
        // When filtering, we include all users with the same points as the Nth user (tie handling)
        let eligibleUsers = sortedByPoints
        let totalParticipants = sortedByPoints.length

        if (topN && topN > 0 && topN < sortedByPoints.length) {
            const cutoffPoints = sortedByPoints[topN - 1].points
            // Include everyone with points >= cutoff (handles ties at the boundary)
            eligibleUsers = sortedByPoints.filter(u => u.points >= cutoffPoints)
        }

        // Calculate total points only from eligible users
        const totalPoints = eligibleUsers.reduce((sum, p) => sum + p.points, 0)

        if (totalPoints === 0) {
            return NextResponse.json({
                stream_session: {
                    id: streamSession.id.toString(),
                    session_title: streamSession.session_title,
                    channel_slug: streamSession.channel_slug,
                    started_at: streamSession.started_at.toISOString(),
                    ended_at: streamSession.ended_at?.toISOString() || null,
                    broadcaster: streamSession.broadcaster,
                },
                payouts: [],
                summary: {
                    total_points: 0,
                    dollar_per_point: 0,
                    total_payout: 0,
                    budget,
                    participant_count: 0,
                    total_participants: totalParticipants,
                    top_n: topN,
                },
            })
        }

        // Calculate dollar per point based on eligible users only
        const dollarPerPoint = budget / totalPoints

        // Build payouts array for eligible users only
        const payoutsRaw = eligibleUsers.map(p => {
            const user = userMap.get(p.user_id.toString())
            const points = p.points
            const rawPayout = points * dollarPerPoint
            const payout = roundTo >= 0 ? Number(rawPayout.toFixed(roundTo)) : rawPayout
            const percentage = (points / totalPoints) * 100

            return {
                user_id: p.user_id.toString(),
                kick_user_id: user?.kick_user_id.toString() || '',
                username: user?.username || 'Unknown',
                profile_picture_url: user?.custom_profile_picture_url || user?.profile_picture_url || null,
                points,
                payout,
                percentage: Number(percentage.toFixed(2)),
            }
        })

        // Already sorted by points descending

        // Assign ranks (dense ranking - same points = same rank)
        let currentRank = 1
        const payouts = payoutsRaw.map((p, index) => {
            if (index > 0 && p.points < payoutsRaw[index - 1].points) {
                currentRank++
            }
            return {
                rank: currentRank,
                ...p,
            }
        })

        // Calculate actual total payout (may differ slightly due to rounding)
        const actualTotalPayout = payouts.reduce((sum, p) => sum + p.payout, 0)

        return NextResponse.json({
            stream_session: {
                id: streamSession.id.toString(),
                session_title: streamSession.session_title,
                channel_slug: streamSession.channel_slug,
                started_at: streamSession.started_at.toISOString(),
                ended_at: streamSession.ended_at?.toISOString() || null,
                total_messages: streamSession.total_messages,
                peak_viewer_count: streamSession.peak_viewer_count,
                broadcaster: streamSession.broadcaster,
            },
            payouts,
            summary: {
                total_points: totalPoints,
                dollar_per_point: Number(dollarPerPoint.toFixed(6)),
                total_payout: Number(actualTotalPayout.toFixed(roundTo)),
                budget,
                participant_count: payouts.length,
                total_participants: totalParticipants,
                top_n: topN,
                rounding_difference: Number((budget - actualTotalPayout).toFixed(roundTo)),
            },
        })
    } catch (error) {
        console.error('Error calculating payouts:', error)
        return NextResponse.json(
            { error: 'Failed to calculate payouts', details: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        )
    }
}
