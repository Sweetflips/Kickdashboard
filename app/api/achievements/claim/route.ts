import { ACHIEVEMENT_BY_ID, isValidAchievementId } from '@/lib/achievements'
import { computeAchievementUnlocks, makeAchievementClaimKey, normalizeAchievementId } from '@/lib/achievements-engine'
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
      return NextResponse.json({ error: 'Achievement not unlocked yet' }, { status: 409 })
    }

    const claimKey = makeAchievementClaimKey(achievementId, auth.userId)
    const normalizedId = normalizeAchievementId(achievementId)
    const now = new Date()

    // Verify AchievementDefinition exists before attempting to claim
    const achievementDef = await (db as any).achievementDefinition.findUnique({
      where: { id: normalizedId },
      select: { id: true },
    })

    if (!achievementDef) {
      console.error(
        `[Achievements] AchievementDefinition not found: ${normalizedId}. This indicates a deployment issue - achievement definitions may not be seeded.`,
      )
      return NextResponse.json(
        {
          error: 'Achievement definition not found in database. Please contact support.',
          details: `Missing achievement: ${normalizedId}`,
        },
        { status: 500 },
      )
    }

    try {
      await (db as any).$transaction(async (tx: any) => {
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

        // Update UserAchievement status to CLAIMED
        await tx.userAchievement.upsert({
          where: {
            user_id_achievement_id: {
              user_id: auth.userId,
              achievement_id: normalizedId,
            },
          },
          update: {
            status: 'CLAIMED',
            claimed_at: now,
          },
          create: {
            user_id: auth.userId,
            achievement_id: normalizedId,
            status: 'CLAIMED',
            unlocked_at: now,
            claimed_at: now,
          },
        })
      })
    } catch (e: unknown) {
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        if (e.code === 'P2002') {
          return NextResponse.json({ claimed: true, alreadyClaimed: true, sweetCoinsAwarded: 0 })
        }
        if (e.code === 'P2003') {
          // Foreign key constraint violation - AchievementDefinition still missing somehow
          console.error(
            `[Achievements] P2003 FK violation for ${normalizedId}. AchievementDefinition check passed but FK failed.`,
            e,
          )
          return NextResponse.json(
            {
              error: 'Database constraint violation. Achievement definition may be missing.',
              details: `Foreign key error for achievement: ${normalizedId}`,
            },
            { status: 500 },
          )
        }
      }
      throw e
    }

    // Get updated balance
    const updatedBalance = await (db as any).userSweetCoins.findUnique({
      where: { user_id: auth.userId },
      select: { total_sweet_coins: true },
    })

    return NextResponse.json({
      claimed: true,
      alreadyClaimed: false,
      sweetCoinsAwarded: def.reward,
      balance: updatedBalance?.total_sweet_coins || 0,
    })
  } catch (error) {
    console.error('Error claiming achievement:', error)
    return NextResponse.json(
      { error: 'Failed to claim achievement', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    )
  }
}
