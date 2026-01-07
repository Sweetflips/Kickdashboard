import { getAuthenticatedUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

interface PositionResponse {
  rank: number | null
  points: number
  periodKey: string // 'all-time' or 'YYYY-MM' for monthly
}

export async function GET(request: Request) {
  try {
    const prisma = db as any
    const auth = await getAuthenticatedUser(request)
    if (!auth) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const period = searchParams.get('period') || 'all-time'

    // Get the user's current Sweet Coins balance
    const userSweetCoins = await prisma.userSweetCoins.findUnique({
      where: { user_id: auth.userId },
      select: { total_sweet_coins: true },
    })

    const points = userSweetCoins?.total_sweet_coins || 0

    if (period === 'all-time') {
      // Calculate rank based on total_sweet_coins
      // Count users with more points
      const usersAhead = await prisma.userSweetCoins.count({
        where: {
          total_sweet_coins: { gt: points },
        },
      })

      const rank = points > 0 ? usersAhead + 1 : null

      const response: PositionResponse = {
        rank,
        points,
        periodKey: 'all-time',
      }

      return NextResponse.json(response, {
        headers: {
          'Cache-Control': 'private, max-age=15, stale-while-revalidate=30',
        },
      })
    }

    // Monthly period (format: YYYY-MM)
    const monthMatch = period.match(/^(\d{4})-(\d{2})$/)
    if (!monthMatch) {
      return NextResponse.json({ error: 'Invalid period format' }, { status: 400 })
    }

    const year = parseInt(monthMatch[1], 10)
    const month = parseInt(monthMatch[2], 10) - 1 // JS months are 0-indexed

    const monthStart = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0))
    const monthEnd = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999))

    // Get points earned in this period
    const periodPoints = await prisma.sweetCoinHistory.aggregate({
      where: {
        user_id: auth.userId,
        earned_at: {
          gte: monthStart,
          lte: monthEnd,
        },
      },
      _sum: { sweet_coins_earned: true },
    })

    const monthlyPoints = periodPoints._sum.sweet_coins_earned || 0

    // Get all users' points for this period to calculate rank
    const allPeriodPointsRaw = await prisma.sweetCoinHistory.groupBy({
      by: ['user_id'],
      where: {
        earned_at: {
          gte: monthStart,
          lte: monthEnd,
        },
      },
      _sum: { sweet_coins_earned: true },
    })

    // Count users with more points
    let usersAhead = 0
    for (const agg of allPeriodPointsRaw as Array<{ user_id: bigint; _sum: { sweet_coins_earned: number | null } }>) {
      const theirPoints = agg._sum.sweet_coins_earned || 0
      if (theirPoints > monthlyPoints) {
        usersAhead++
      }
    }

    const rank = monthlyPoints > 0 ? usersAhead + 1 : null

    const response: PositionResponse = {
      rank,
      points: monthlyPoints,
      periodKey: period,
    }

    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'private, max-age=15, stale-while-revalidate=30',
      },
    })
  } catch (error) {
    console.error('Error fetching leaderboard position:', error)
    return NextResponse.json(
      { error: 'Failed to fetch leaderboard position' },
      { status: 500 }
    )
  }
}
