import { ACHIEVEMENTS } from '@/lib/achievements'
import { computeAchievementUnlocks, makeAchievementClaimKey } from '@/lib/achievements-engine'
import { getAuthenticatedUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

interface AchievementStatus {
  id: string
  unlocked: boolean
  claimed: boolean
}

interface AchievementsResponse {
  achievements: AchievementStatus[]
}

export async function GET(request: Request) {
  try {
    const auth = await getAuthenticatedUser(request)
    if (!auth) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const { user, unlockedById } = await computeAchievementUnlocks(auth)
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const claimKeys = ACHIEVEMENTS.map((a) => makeAchievementClaimKey(a.id, auth.userId))
    const claimedRows = await db.sweetCoinHistory.findMany({
      where: {
        user_id: auth.userId,
        message_id: { in: claimKeys },
      },
      select: { message_id: true },
    })
    const claimedSet = new Set(claimedRows.map((r) => r.message_id).filter(Boolean) as string[])

    const statuses: AchievementStatus[] = ACHIEVEMENTS.map((a) => ({
      id: a.id,
      unlocked: unlockedById[a.id] === true,
      claimed: claimedSet.has(makeAchievementClaimKey(a.id, auth.userId)),
    }))

    const response: AchievementsResponse = {
      achievements: statuses,
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('Error computing achievements:', error)
    return NextResponse.json(
      { error: 'Failed to compute achievements', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    )
  }
}
