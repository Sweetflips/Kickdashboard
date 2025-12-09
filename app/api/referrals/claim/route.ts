import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const REFERRAL_TIERS = [
    { id: 'starter', requiredPoints: 100, yourReward: 25, theirReward: 25 },
    { id: 'active', requiredPoints: 500, yourReward: 75, theirReward: 50 },
    { id: 'dedicated', requiredPoints: 1000, yourReward: 150, theirReward: 100 },
    { id: 'superfan', requiredPoints: 2500, yourReward: 300, theirReward: 200 },
    { id: 'legend', requiredPoints: 5000, yourReward: 500, theirReward: 350 },
]

/**
 * Internal endpoint called by the points system to check and award referral rewards
 * POST /api/referrals/claim
 * Body: { refereeUserId: number }
 */
export async function POST(request: Request) {
    try {
        // Verify internal request (could add a secret token check here)
        const body = await request.json()
        const { refereeUserId } = body

        if (!refereeUserId) {
            return NextResponse.json(
                { error: 'refereeUserId required' },
                { status: 400 }
            )
        }

        // Find the referral relationship
        const referral = await db.referral.findUnique({
            where: { referee_user_id: refereeUserId },
            include: {
                referee: {
                    select: {
                        points: {
                            select: { total_points: true }
                        }
                    }
                }
            }
        })

        if (!referral) {
            // No referral relationship, nothing to do
            return NextResponse.json({ message: 'No referral found for user' })
        }

        const refereePoints = referral.referee.points?.total_points || 0
        const referrerId = referral.referrer_user_id

        // Check each tier and award if not already awarded
        const awardedRewards: any[] = []

        for (const tier of REFERRAL_TIERS) {
            if (refereePoints >= tier.requiredPoints) {
                // Check if this tier was already awarded
                const existingReward = await db.referralReward.findFirst({
                    where: {
                        referrer_user_id: referrerId,
                        referee_user_id: refereeUserId,
                        tier_id: tier.id,
                    }
                })

                if (!existingReward) {
                    // Award this tier
                    try {
                        const reward = await db.referralReward.create({
                            data: {
                                referrer_user_id: referrerId,
                                referee_user_id: refereeUserId,
                                tier_id: tier.id,
                                required_points: tier.requiredPoints,
                                reward_points: tier.yourReward,
                            }
                        })

                        // Add points to referrer
                        const referrerPoints = await db.userPoints.findUnique({
                            where: { user_id: referrerId }
                        })

                        if (referrerPoints) {
                            await db.userPoints.update({
                                where: { user_id: referrerId },
                                data: {
                                    total_points: {
                                        increment: tier.yourReward
                                    }
                                }
                            })
                        }

                        // Log the point award
                        await db.pointHistory.create({
                            data: {
                                user_id: referrerId,
                                points_earned: tier.yourReward,
                            }
                        })

                        awardedRewards.push({
                            tier: tier.id,
                            points: tier.yourReward,
                            rewardId: reward.id
                        })

                        console.log(`✅ Awarded referral reward: ${tier.id} (+${tier.yourReward}) to user ${referrerId}`)
                    } catch (awardError) {
                        console.error(`❌ Error awarding reward for tier ${tier.id}:`, awardError)
                    }
                }
            }
        }

        return NextResponse.json({
            success: true,
            message: `Checked and awarded ${awardedRewards.length} referral tier(s)`,
            awarded: awardedRewards,
        })
    } catch (error) {
        console.error('❌ Error checking/awarding referral rewards:', error)
        return NextResponse.json(
            { error: 'Failed to process referral rewards' },
            { status: 500 }
        )
    }
}
