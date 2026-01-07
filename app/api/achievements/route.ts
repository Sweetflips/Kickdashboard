import { ACHIEVEMENTS } from '@/lib/achievements'
import { getAchievementStatuses } from '@/lib/achievements-engine'
import { getAuthenticatedUser } from '@/lib/auth'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

interface AchievementStatusResponse {
  id: string
  unlocked: boolean
  claimed: boolean
  status: 'LOCKED' | 'UNLOCKED' | 'CLAIMED'
}

interface AchievementsResponse {
  achievements: AchievementStatusResponse[]
}

export async function GET(request: Request) {
  try {
    const auth = await getAuthenticatedUser(request)
    if (!auth) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    console.log(`[Achievements API] Evaluating for userId=${auth.userId}, kickUserId=${auth.kickUserId}`)
    
    const { achievements } = await getAchievementStatuses(auth)
    
    const unlockedCount = achievements.filter(a => a.status !== 'LOCKED').length
    console.log(`[Achievements API] Result: ${unlockedCount}/${achievements.length} unlocked`)

    const statuses: AchievementStatusResponse[] = achievements.map((a) => ({
      id: a.id,
      unlocked: a.status === 'UNLOCKED' || a.status === 'CLAIMED',
      claimed: a.status === 'CLAIMED',
      status: a.status,
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
