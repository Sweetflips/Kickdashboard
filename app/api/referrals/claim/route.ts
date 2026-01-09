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
        const prisma = db as any
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
        const referral = await prisma.referral.findUnique({
            where: { referee_user_id: refereeUserId },
            include: {
                referee: {
                    select: {
                        sweet_coins: {
                            select: { total_sweet_coins: true }
                        }
                    }
                }
            }
        })

        if (!referral) {
            // No referral relationship, nothing to do
            return NextResponse.json({ message: 'No referral found for user' })
        }

        const refereePoints = referral.referee.sweet_coins?.total_sweet_coins || 0
        const referrerId = referral.referrer_user_id

        // Check each tier and award if not already awarded
        const awardedRewards: any[] = []

        for (const tier of REFERRAL_TIERS) {
            if (refereePoints >= tier.requiredPoints) {
                // Check if this tier was already awarded
                const existingReward = await prisma.referralReward.findFirst({
                    where: {
                        referrer_user_id: referrerId,
                        referee_user_id: refereeUserId,
                        tier_id: tier.id,
                    }
                })

                if (!existingReward) {
                    // Award this tier to both referrer and referee
                    try {
                        const prisma = db as any
                        
                        // Award referrer (create record if it doesn't exist)
                        await prisma.userSweetCoins.upsert({
                            where: { user_id: referrerId },
                            update: {
                                total_sweet_coins: {
                                    increment: tier.yourReward
                                }
                            },
                            create: {
                                user_id: referrerId,
                                total_sweet_coins: tier.yourReward,
                                total_emotes: 0,
                            }
                        })

                        // Log the referrer's Sweet Coins award
                        await prisma.sweetCoinHistory.create({
                            data: {
                                user_id: referrerId,
                                sweet_coins_earned: tier.yourReward,
                            }
                        })

                        // Award referee (create record if it doesn't exist)
                        await prisma.userSweetCoins.upsert({
                            where: { user_id: refereeUserId },
                            update: {
                                total_sweet_coins: {
                                    increment: tier.theirReward
                                }
                            },
                            create: {
                                user_id: refereeUserId,
                                total_sweet_coins: tier.theirReward,
                                total_emotes: 0,
                            }
                        })

                        // Log the referee's Sweet Coins award
                        await prisma.sweetCoinHistory.create({
                            data: {
                                user_id: refereeUserId,
                                sweet_coins_earned: tier.theirReward,
                            }
                        })

                        // Create reward record tracking both awards
                        const reward = await prisma.referralReward.create({
                            data: {
                                referrer_user_id: referrerId,
                                referee_user_id: refereeUserId,
                                tier_id: tier.id,
                                required_sweet_coins: tier.requiredPoints,
                                reward_sweet_coins: tier.yourReward,
                                referee_reward_awarded: true,
                            }
                        })

                        awardedRewards.push({
                            tier: tier.id,
                            referrerReward: tier.yourReward,
                            refereeReward: tier.theirReward,
                            rewardId: reward.id
                        })

                        console.log(`✅ Awarded referral rewards for tier ${tier.id}: Referrer ${referrerId} (+${tier.yourReward}), Referee ${refereeUserId} (+${tier.theirReward})`)
                    } catch (awardError) {
                        console.error(`❌ Error awarding reward for tier ${tier.id}:`, awardError)
                    }
                } else if (!existingReward.referee_reward_awarded || existingReward.referee_reward_awarded === null) {
                    // Referrer was already awarded, but referee wasn't - award referee now
                    try {
                        const prisma = db as any
                        
                        // Award referee (create record if it doesn't exist)
                        await prisma.userSweetCoins.upsert({
                            where: { user_id: refereeUserId },
                            update: {
                                total_sweet_coins: {
                                    increment: tier.theirReward
                                }
                            },
                            create: {
                                user_id: refereeUserId,
                                total_sweet_coins: tier.theirReward,
                                total_emotes: 0,
                            }
                        })

                        // Log the referee's Sweet Coins award
                        await prisma.sweetCoinHistory.create({
                            data: {
                                user_id: refereeUserId,
                                sweet_coins_earned: tier.theirReward,
                            }
                        })

                        // Update reward record to mark referee reward as awarded
                        await prisma.referralReward.update({
                            where: {
                                id: existingReward.id
                            },
                            data: {
                                referee_reward_awarded: true,
                            }
                        })

                        awardedRewards.push({
                            tier: tier.id,
                            referrerReward: 0, // Already awarded
                            refereeReward: tier.theirReward,
                            rewardId: existingReward.id
                        })

                        console.log(`✅ Awarded referee reward for tier ${tier.id}: Referee ${refereeUserId} (+${tier.theirReward})`)
                    } catch (awardError) {
                        console.error(`❌ Error awarding referee reward for tier ${tier.id}:`, awardError)
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
