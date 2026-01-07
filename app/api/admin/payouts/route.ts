import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { canViewPayouts } from '@/lib/auth'
import { rewriteApiMediaUrlToCdn } from '@/lib/media-url'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
    try {
        // Check access (admin or moderator)
        const accessCheck = await canViewPayouts(request)
        if (!accessCheck) {
            return NextResponse.json(
                { error: 'Unauthorized - Admin or Moderator access required' },
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

        const prisma = db as any

        // Get stream session info
        const streamSession = await prisma.streamSession.findUnique({
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

        // Get all Sweet Coins earned in this stream session, grouped by user
        const sweetCoinsByUser = await prisma.sweetCoinHistory.groupBy({
            by: ['user_id'],
            where: {
                stream_session_id: BigInt(streamSessionId),
            },
            _sum: {
                sweet_coins_earned: true,
            },
        })

        if (sweetCoinsByUser.length === 0) {
            return NextResponse.json({
                stream_session: {
                    id: streamSession.id.toString(),
                    session_title: streamSession.session_title,
                    channel_slug: streamSession.channel_slug,
                    started_at: streamSession.started_at.toISOString(),
                    ended_at: streamSession.ended_at?.toISOString() || null,
                    broadcaster: {
                        ...streamSession.broadcaster,
                        profile_picture_url: rewriteApiMediaUrlToCdn(streamSession.broadcaster.profile_picture_url),
                    },
                },
                payouts: [],
                summary: {
                    total_sweet_coins: 0,
                    dollar_per_sweet_coin: 0,
                    total_payout: 0,
                    budget,
                    participant_count: 0,
                },
            })
        }

        // Get user details for all participants
        const userIds = (sweetCoinsByUser as Array<{ user_id: bigint; _sum: { sweet_coins_earned: number | null } }>).map(p => p.user_id)
        const users = await prisma.user.findMany({
            where: {
                id: { in: userIds },
            },
            select: {
                id: true,
                kick_user_id: true,
                username: true,
                profile_picture_url: true,
                custom_profile_picture_url: true,
                telegram_username: true,
            },
        })

        const userMap = new Map((users as any[]).map((u: any) => [u.id.toString(), u]))

        // Rank bonus multipliers (top 3 bonuses; everyone else is even)
        const RANK_MULTIPLIERS: Record<number, number> = {
            // Requested: 1st +100%, 2nd +75%, 3rd +50% (rest 1.0)
            1: 2.0,
            2: 1.75,
            3: 1.5,
        }

        // Build initial sorted list by Sweet Coins
        const sortedBySweetCoins = (sweetCoinsByUser as Array<{ user_id: bigint; _sum: { sweet_coins_earned: number | null } }>)
            .map(p => ({
                user_id: p.user_id,
                sweet_coins: p._sum.sweet_coins_earned || 0,
            }))
            .sort((a, b) => b.sweet_coins - a.sweet_coins)

        // Assign ranks using DENSE ranking (1, 1, 1, 2, 3, ...) - ties share rank, next unique value gets next rank
        let currentRank = 1
        const withRanks = sortedBySweetCoins.map((p, index) => {
            if (index > 0 && p.sweet_coins < sortedBySweetCoins[index - 1].sweet_coins) {
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

        // Calculate weighted Sweet Coins (with rank bonus if enabled)
        const usersWithWeightedPoints = eligibleUsers.map(u => {
            const multiplier = rankBonus ? (RANK_MULTIPLIERS[u.rank] || 1.0) : 1.0
            return {
                ...u,
                multiplier,
                weightedSweetCoins: u.sweet_coins * multiplier,
            }
        })

        // Calculate total weighted Sweet Coins
        const totalWeightedSweetCoins = usersWithWeightedPoints.reduce((sum, p) => sum + p.weightedSweetCoins, 0)
        const totalSweetCoins = eligibleUsers.reduce((sum, p) => sum + p.sweet_coins, 0)

        if (totalSweetCoins === 0) {
            return NextResponse.json({
                stream_session: {
                    id: streamSession.id.toString(),
                    session_title: streamSession.session_title,
                    channel_slug: streamSession.channel_slug,
                    started_at: streamSession.started_at.toISOString(),
                    ended_at: streamSession.ended_at?.toISOString() || null,
                    broadcaster: {
                        ...streamSession.broadcaster,
                        profile_picture_url: rewriteApiMediaUrlToCdn(streamSession.broadcaster.profile_picture_url),
                    },
                },
                payouts: [],
                summary: {
                    total_sweet_coins: 0,
                    dollar_per_sweet_coin: 0,
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
        const dollarPerWeightedSweetCoin = budget / totalWeightedSweetCoins

        // Build payouts array for eligible users only
        const payouts = usersWithWeightedPoints.map(p => {
            const user = userMap.get(p.user_id.toString()) as any
            const rawPayout = p.weightedSweetCoins * dollarPerWeightedSweetCoin
            const payout = roundTo >= 0 ? Number(rawPayout.toFixed(roundTo)) : rawPayout
            const percentage = (p.weightedSweetCoins / totalWeightedSweetCoins) * 100

            return {
                rank: p.rank,
                user_id: p.user_id.toString(),
                kick_user_id: user?.kick_user_id.toString() || '',
                username: user?.username || 'Unknown',
                telegram_username: user?.telegram_username || null,
                profile_picture_url: rewriteApiMediaUrlToCdn(user?.custom_profile_picture_url || user?.profile_picture_url || null),
                // Return both field names for compatibility (UI expects 'points', 'weighted_points')
                points: p.sweet_coins,
                sweet_coins: p.sweet_coins,
                multiplier: p.multiplier,
                weighted_points: Number(p.weightedSweetCoins.toFixed(2)),
                weighted_sweet_coins: Number(p.weightedSweetCoins.toFixed(2)),
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
                broadcaster: {
                    ...streamSession.broadcaster,
                    profile_picture_url: rewriteApiMediaUrlToCdn(streamSession.broadcaster.profile_picture_url),
                },
            },
            payouts,
            summary: {
                total_sweet_coins: totalSweetCoins,
                total_weighted_sweet_coins: Number(totalWeightedSweetCoins.toFixed(2)),
                dollar_per_sweet_coin: Number((budget / totalSweetCoins).toFixed(6)),
                dollar_per_weighted_sweet_coin: Number(dollarPerWeightedSweetCoin.toFixed(6)),
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
