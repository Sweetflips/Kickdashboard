import { ACHIEVEMENT_BY_ID, isValidAchievementId } from '@/lib/achievements'
import { computeAchievementUnlocks, makeAchievementClaimKey } from '@/lib/achievements-engine'
import { getAuthenticatedUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const auth = await getAuthenticatedUser(request)
    if (!auth) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({} as any))
    const achievementId = typeof body?.achievementId === 'string' ? body.achievementId : null

    if (!achievementId) {
      return NextResponse.json({ error: 'achievementId is required' }, { status: 400 })
    }

    if (!isValidAchievementId(achievementId)) {
      return NextResponse.json({ error: 'Unknown achievementId' }, { status: 400 })
    }

    const def = ACHIEVEMENT_BY_ID[achievementId]
    const { user, unlockedById } = await computeAchievementUnlocks(auth)
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    if (unlockedById[achievementId] !== true) {
      return NextResponse.json({ error: 'Achievement not unlocked yet' }, { status: 400 })
    }

    const claimKey = makeAchievementClaimKey(achievementId, auth.userId)
    const now = new Date()

    try {
      await db.$transaction(async (tx) => {
        // Create history entry first (idempotency is enforced by unique message_id)
        await tx.sweetCoinHistory.create({
          data: {
            user_id: auth.userId,
            stream_session_id: null,
            sweet_coins_earned: def.reward,
            message_id: claimKey,
            earned_at: now,
          },
        })

        await tx.userSweetCoins.upsert({
          where: { user_id: auth.userId },
          update: {
            total_sweet_coins: { increment: def.reward },
          },
          create: {
            user_id: auth.userId,
            total_sweet_coins: def.reward,
            total_emotes: 0,
          },
        })
      })
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        return NextResponse.json({ claimed: true, alreadyClaimed: true, sweetCoinsAwarded: 0 })
      }
      throw e
    }

    return NextResponse.json({ claimed: true, alreadyClaimed: false, sweetCoinsAwarded: def.reward })
  } catch (error) {
    console.error('Error claiming achievement:', error)
    return NextResponse.json(
      { error: 'Failed to claim achievement', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    )
  }
}
