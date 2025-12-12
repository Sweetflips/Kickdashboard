import { getAuthenticatedUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { rewriteApiMediaUrlToCdn } from '@/lib/media-url'

export const dynamic = 'force-dynamic'

const REFERRAL_TIERS = [
    { id: 'starter', requiredPoints: 100, yourReward: 25, theirReward: 25 },
    { id: 'active', requiredPoints: 500, yourReward: 75, theirReward: 50 },
    { id: 'dedicated', requiredPoints: 1000, yourReward: 150, theirReward: 100 },
    { id: 'superfan', requiredPoints: 2500, yourReward: 300, theirReward: 200 },
    { id: 'legend', requiredPoints: 5000, yourReward: 500, theirReward: 350 },
]

export async function GET(request: Request) {
    try {
        // Get authenticated user
        const auth = await getAuthenticatedUser(request)
        if (!auth) {
            return NextResponse.json(
                { error: 'Authentication required' },
                { status: 401 }
            )
        }

        // Get all referrals for this user
        const referrals = await db.referral.findMany({
            where: { referrer_user_id: auth.userId },
            include: {
                referee: {
                    select: {
                        id: true,
                        username: true,
                        profile_picture_url: true,
                        sweet_coins: {
                            select: { total_sweet_coins: true }
                        }
                    }
                }
            },
            orderBy: { created_at: 'desc' }
        })

        // Get all rewards earned by this user
        const rewards = await db.referralReward.findMany({
            where: { referrer_user_id: auth.userId },
            orderBy: { awarded_at: 'desc' }
        })

        // Calculate stats
        const totalReferrals = referrals.length
        const totalEarned = rewards.reduce((sum: number, r: any) => sum + r.reward_sweet_coins, 0)

        // Build referral list with milestone data
        const referralsList = referrals.map((ref: any) => {
            const refereeSweetCoins = ref.referee.sweet_coins?.total_sweet_coins || 0
            const completedMilestones = REFERRAL_TIERS.filter(t => refereeSweetCoins >= t.requiredPoints)
            const earnedFromThisReferral = rewards
                .filter((r: any) => r.referee_user_id === ref.referee_user_id)
                .reduce((sum: number, r: any) => sum + r.reward_sweet_coins, 0)

            return {
                id: ref.id,
                referee: {
                    id: ref.referee.id,
                    username: ref.referee.username,
                    profilePicture: rewriteApiMediaUrlToCdn(ref.referee.profile_picture_url),
                },
                sweet_coins: refereeSweetCoins,
                referredAt: ref.created_at,
                earnedSweetCoins: earnedFromThisReferral,
                completedTiers: completedMilestones.map(t => t.id),
            }
        })

        // Calculate pending rewards (next unclaimed milestone)
        let pendingRewards = 0
        for (const ref of referrals) {
            const refereeSweetCoins = ref.referee.sweet_coins?.total_sweet_coins || 0
            const earnedTiers = rewards
                .filter((r: any) => r.referee_user_id === ref.referee_user_id)
                .map((r: any) => r.tier_id)

            for (const tier of REFERRAL_TIERS) {
                if (refereeSweetCoins >= tier.requiredPoints && !earnedTiers.includes(tier.id)) {
                    pendingRewards += tier.yourReward
                }
            }
        }

        // Count active referrals (those who have earned at least some Sweet Coins)
        const activeReferrals = referrals.filter(
            (ref: any) => (ref.referee.sweet_coins?.total_sweet_coins || 0) > 0
        ).length

        return NextResponse.json({
            stats: {
                totalReferrals,
                activeReferrals,
                totalEarned,
                pendingRewards,
            },
            referrals: referralsList,
        })
    } catch (error) {
        console.error('❌ Error fetching referral stats:', error)
        return NextResponse.json(
            { error: 'Failed to fetch referral stats' },
            { status: 500 }
        )
    }
}
