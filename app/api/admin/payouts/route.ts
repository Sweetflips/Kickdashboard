import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { isAdmin } from '@/lib/auth'

export const dynamic = 'force-dynamic'

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
        const rankBonus = searchParams.get('rank_bonus') === 'true' // Apply rank-based multipliers

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

        // Rank bonus multipliers (1st gets 50% bonus, 2nd 30%, 3rd 15%, 4th 8%, 5th 4%)
        const RANK_MULTIPLIERS: Record<number, number> = {
            1: 1.50,
            2: 1.30,
            3: 1.15,
            4: 1.08,
            5: 1.04,
        }

        // Build initial sorted list by points
        const sortedByPoints = pointsByUser
            .map(p => ({
                user_id: p.user_id,
                points: p._sum.points_earned || 0,
            }))
            .sort((a, b) => b.points - a.points)

        // Assign ranks using DENSE ranking (1, 1, 1, 2, 3, ...) - ties share rank, next unique value gets next rank
        let currentRank = 1
        const withRanks = sortedByPoints.map((p, index) => {
            if (index > 0 && p.points < sortedByPoints[index - 1].points) {
                currentRank++ // Dense ranking: next different value gets next rank number
            }
            return { ...p, rank: currentRank }
        })

        // Apply rank filter if specified
        // Filter by actual RANK, not by position - includes all users at each rank level
        let eligibleUsers = withRanks
        let totalParticipants = withRanks.length

        if (topN && topN > 0) {
            // Include ALL users whose rank is <= topN
            // e.g., "Rank 1-3" shows everyone with rank 1, 2, or 3 (including all ties at each rank)
            eligibleUsers = withRanks.filter(u => u.rank <= topN)
        }

        // Calculate weighted points (with rank bonus if enabled)
        const usersWithWeightedPoints = eligibleUsers.map(u => {
            const multiplier = rankBonus ? (RANK_MULTIPLIERS[u.rank] || 1.0) : 1.0
            return {
                ...u,
                multiplier,
                weightedPoints: u.points * multiplier,
            }
        })

        // Calculate total weighted points
        const totalWeightedPoints = usersWithWeightedPoints.reduce((sum, p) => sum + p.weightedPoints, 0)
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
                    rank_bonus: rankBonus,
                },
            })
        }

        // Calculate dollar per weighted point (uses weighted points if rank bonus enabled)
        const dollarPerWeightedPoint = budget / totalWeightedPoints

        // Build payouts array for eligible users only
        const payouts = usersWithWeightedPoints.map(p => {
            const user = userMap.get(p.user_id.toString())
            const rawPayout = p.weightedPoints * dollarPerWeightedPoint
            const payout = roundTo >= 0 ? Number(rawPayout.toFixed(roundTo)) : rawPayout
            const percentage = (p.weightedPoints / totalWeightedPoints) * 100

            return {
                rank: p.rank,
                user_id: p.user_id.toString(),
                kick_user_id: user?.kick_user_id.toString() || '',
                username: user?.username || 'Unknown',
                profile_picture_url: user?.custom_profile_picture_url || user?.profile_picture_url || null,
                points: p.points,
                multiplier: p.multiplier,
                weighted_points: Number(p.weightedPoints.toFixed(2)),
                payout,
                percentage: Number(percentage.toFixed(2)),
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
                total_weighted_points: Number(totalWeightedPoints.toFixed(2)),
                dollar_per_point: Number((budget / totalPoints).toFixed(6)),
                dollar_per_weighted_point: Number(dollarPerWeightedPoint.toFixed(6)),
                total_payout: Number(actualTotalPayout.toFixed(roundTo)),
                budget,
                participant_count: payouts.length,
                total_participants: totalParticipants,
                top_n: topN,
                rank_bonus: rankBonus,
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
