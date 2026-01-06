import { isAdmin } from '@/lib/auth'
import { db } from '@/lib/db'
import { evaluateAchievementsForUser } from '@/lib/achievements-engine'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * Admin endpoint to close a leaderboard period.
 * 
 * Call this at the end of each period (daily/weekly/monthly) to:
 * 1. Record top 3 users in LeaderboardPeriodResult
 * 2. Unlock TOP_G_CHATTER achievement for top 3
 * 3. For monthly periods: record MonthlyWinner and unlock SF_LEGEND_OF_THE_MONTH
 * 
 * Expected to be called by cron job with shared secret header.
 */
export async function POST(request: Request) {
  try {
    // Verify admin or cron secret
    const cronSecret = process.env.CRON_SECRET
    const authHeader = request.headers.get('authorization')
    
    const isCronAuth = cronSecret && authHeader === `Bearer ${cronSecret}`
    const isAdminAuth = await isAdmin(request)
    
    if (!isCronAuth && !isAdminAuth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const periodKey = body.periodKey as string | undefined
    const periodType = body.periodType as 'monthly' | 'weekly' | undefined

    if (!periodKey) {
      return NextResponse.json({ error: 'periodKey is required' }, { status: 400 })
    }

    // Determine date range based on period key
    let startDate: Date
    let endDate: Date

    if (periodType === 'monthly' || periodKey.match(/^\d{4}-\d{2}$/)) {
      // Monthly period (YYYY-MM)
      const match = periodKey.match(/^(\d{4})-(\d{2})$/)
      if (!match) {
        return NextResponse.json({ error: 'Invalid monthly periodKey format (expected YYYY-MM)' }, { status: 400 })
      }
      const year = parseInt(match[1], 10)
      const month = parseInt(match[2], 10) - 1
      startDate = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0))
      endDate = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999))
    } else if (periodKey.match(/^\d{4}-W\d{2}$/)) {
      // Weekly period (YYYY-Www)
      // This is more complex - using ISO week numbering
      const match = periodKey.match(/^(\d{4})-W(\d{2})$/)
      if (!match) {
        return NextResponse.json({ error: 'Invalid weekly periodKey format (expected YYYY-Www)' }, { status: 400 })
      }
      const year = parseInt(match[1], 10)
      const week = parseInt(match[2], 10)
      // Calculate week start (Monday) and end (Sunday)
      const jan1 = new Date(Date.UTC(year, 0, 1))
      const dayOfWeek = jan1.getUTCDay() || 7
      const weekStart = new Date(jan1)
      weekStart.setUTCDate(jan1.getUTCDate() + (week - 1) * 7 - dayOfWeek + 1)
      startDate = weekStart
      endDate = new Date(weekStart)
      endDate.setUTCDate(endDate.getUTCDate() + 6)
      endDate.setUTCHours(23, 59, 59, 999)
    } else {
      return NextResponse.json({ error: 'Invalid periodKey format' }, { status: 400 })
    }

    // Get top users for this period
    const periodPointsRaw = await db.sweetCoinHistory.groupBy({
      by: ['user_id'],
      where: {
        earned_at: {
          gte: startDate,
          lte: endDate,
        },
      },
      _sum: { sweet_coins_earned: true },
    })

    // Type cast and sort by points descending
    const periodPoints = (periodPointsRaw as Array<{
      user_id: bigint
      _sum: { sweet_coins_earned: number | null }
    }>).sort((a, b) => {
      const aPoints = a._sum.sweet_coins_earned || 0
      const bPoints = b._sum.sweet_coins_earned || 0
      return bPoints - aPoints
    })

    // Take top 3
    const top3 = periodPoints.slice(0, 3)

    // Get user details
    const topUserIds = top3.map((u) => u.user_id)
    const topUsers = await db.user.findMany({
      where: { id: { in: topUserIds } },
      select: { id: true, kick_user_id: true },
    })

    const userMap = new Map(topUsers.map((u) => [u.id.toString(), u]))

    const results = {
      periodKey,
      topRanks: [] as Array<{ userId: string; rank: number; points: number }>,
      monthlyWinner: null as { userId: string; points: number } | null,
      achievementsUnlocked: [] as string[],
    }

    // Record period results and unlock TOP_G_CHATTER
    for (let i = 0; i < top3.length; i++) {
      const entry = top3[i]
      const rank = i + 1
      const points = entry._sum.sweet_coins_earned || 0
      const user = userMap.get(entry.user_id.toString())

      if (!user) continue

      // Upsert period result
      await db.leaderboardPeriodResult.upsert({
        where: {
          period_key_user_id: {
            period_key: periodKey,
            user_id: user.id,
          },
        },
        update: { rank, points },
        create: {
          period_key: periodKey,
          user_id: user.id,
          rank,
          points,
        },
      })

      results.topRanks.push({ userId: user.id.toString(), rank, points })

      // Evaluate achievements (will unlock TOP_G_CHATTER based on current state)
      try {
        const evalResult = await evaluateAchievementsForUser({
          userId: user.id,
          kickUserId: user.kick_user_id,
        })
        if (evalResult.newlyUnlocked.length > 0) {
          results.achievementsUnlocked.push(
            ...evalResult.newlyUnlocked.map((a) => `${user.id}:${a}`)
          )
        }
      } catch (evalError) {
        console.error(`Failed to evaluate achievements for user ${user.id}:`, evalError)
      }
    }

    // Handle monthly winner (SF_LEGEND_OF_THE_MONTH)
    if ((periodType === 'monthly' || periodKey.match(/^\d{4}-\d{2}$/)) && top3.length > 0) {
      const winner = top3[0]
      const winnerUser = userMap.get(winner.user_id.toString())
      const winnerPoints = winner._sum.sweet_coins_earned || 0

      if (winnerUser) {
        // Record monthly winner
        await db.monthlyWinner.upsert({
          where: { month_key: periodKey },
          update: {
            user_id: winnerUser.id,
            points: winnerPoints,
          },
          create: {
            month_key: periodKey,
            user_id: winnerUser.id,
            points: winnerPoints,
          },
        })

        results.monthlyWinner = { userId: winnerUser.id.toString(), points: winnerPoints }

        // Re-evaluate achievements for winner to unlock SF_LEGEND_OF_THE_MONTH
        try {
          await evaluateAchievementsForUser({
            userId: winnerUser.id,
            kickUserId: winnerUser.kick_user_id,
          })
        } catch (evalError) {
          console.error(`Failed to evaluate achievements for monthly winner ${winnerUser.id}:`, evalError)
        }
      }
    }

    return NextResponse.json({
      success: true,
      ...results,
    })
  } catch (error) {
    console.error('Error closing period:', error)
    return NextResponse.json(
      { error: 'Failed to close period', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
