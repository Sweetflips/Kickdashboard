import { getAuthenticatedUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

interface AchievementStatus {
  id: string
  unlocked: boolean
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

    const [user, userPoints] = await Promise.all([
      db.user.findUnique({
        where: { id: auth.userId },
        select: {
          id: true,
          created_at: true,
        },
      }),
      db.userPoints.findUnique({
        where: { user_id: auth.userId },
        select: {
          total_points: true,
          total_emotes: true,
        },
      }),
    ])

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Fetch all chat messages for this user (online only) for message-based achievements
    const messages = await db.chatMessage.findMany({
      where: {
        sender_user_id: auth.kickUserId,
        sent_when_offline: false,
      },
      select: {
        created_at: true,
        stream_session_id: true,
      },
    })

    const totalMessages = messages.length

    // Daily chatter: count unique days with at least one message
    const dailyChatDays = new Set<string>()
    for (const msg of messages) {
      dailyChatDays.add(msg.created_at.toISOString().slice(0, 10))
    }

    // Streams where the user has chatted
    const sessionIdSet = new Set<bigint>()
    const now = new Date()
    const since24h = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    const recentSessionIdSet = new Set<bigint>()

    for (const msg of messages) {
      if (msg.stream_session_id) {
        sessionIdSet.add(msg.stream_session_id)
        if (msg.created_at >= since24h) {
          recentSessionIdSet.add(msg.stream_session_id)
        }
      }
    }

    // Calculate approximate watch time: sum durations of sessions where user chatted
    let totalWatchSeconds = 0
    if (sessionIdSet.size > 0) {
      const sessions = await db.streamSession.findMany({
        where: { id: { in: Array.from(sessionIdSet) } },
        select: {
          id: true,
          duration_seconds: true,
          started_at: true,
          ended_at: true,
        },
      })

      totalWatchSeconds = sessions.reduce((sum, session) => {
        let duration = session.duration_seconds
        if (duration == null) {
          const end = session.ended_at ?? now
          duration = Math.max(0, Math.floor((end.getTime() - session.started_at.getTime()) / 1000))
        }
        return sum + (duration || 0)
      }, 0)
    }

    const totalWatchMinutes = totalWatchSeconds / 60

    // Dashboard Addict: days logged into dashboard this month (via UserSession)
    const monthNow = new Date()
    const monthStart = new Date(Date.UTC(monthNow.getUTCFullYear(), monthNow.getUTCMonth(), 1, 0, 0, 0, 0))
    const monthEnd = new Date(Date.UTC(monthNow.getUTCFullYear(), monthNow.getUTCMonth() + 1, 0, 23, 59, 59, 999))

    const sessionsThisMonth = await db.userSession.findMany({
      where: {
        user_id: auth.userId,
        created_at: {
          gte: monthStart,
          lte: monthEnd,
        },
      },
      select: {
        created_at: true,
      },
    })

    const loginDaysThisMonth = new Set<string>()
    for (const s of sessionsThisMonth) {
      loginDaysThisMonth.add(s.created_at.toISOString().slice(0, 10))
    }

    // Raffle achievements
    const [rafflesEntered, rafflesWon] = await Promise.all([
      db.raffleEntry.count({ where: { user_id: auth.userId } }),
      db.raffleWinner.count({ where: { entry: { user_id: auth.userId } } }),
    ])

    // Global/top-based achievements
    const [topUsersByPoints, monthlyPointAggs] = await Promise.all([
      db.userPoints.findMany({
        take: 3,
        orderBy: {
          total_points: 'desc',
        },
        select: { user_id: true },
      }),
      (async () => {
        // SF Legend of the month: most points earned in current month
        const start = monthStart
        const end = monthEnd
        return db.pointHistory.groupBy({
          by: ['user_id'],
          where: {
            earned_at: {
              gte: start,
              lte: end,
            },
          },
          _sum: {
            points_earned: true,
          },
        })
      })(),
    ])

    const isTopGChatter = topUsersByPoints.some((u) => u.user_id === auth.userId)

    let isMonthlyLegend = false
    if (monthlyPointAggs.length > 0) {
      let maxPoints = 0
      for (const agg of monthlyPointAggs) {
        const pts = agg._sum.points_earned || 0
        if (pts > maxPoints) maxPoints = pts
      }
      const topUsers = monthlyPointAggs.filter((agg) => (agg._sum.points_earned || 0) === maxPoints)
      isMonthlyLegend = topUsers.some((agg) => agg.user_id === auth.userId)
    }

    // OG Dash: one of the first 100 users created
    let isOgDash = false
    if (user.created_at) {
      const earlierCount = await db.user.count({
        where: {
          created_at: {
            lt: user.created_at,
          },
        },
      })
      isOgDash = earlierCount < 100
    }

    const totalEmotes = userPoints?.total_emotes || 0

    // Build achievement statuses
    const statuses: AchievementStatus[] = []

    // Stream time thresholds are based on total watch minutes
    statuses.push(
      {
        id: 'stream-starter',
        unlocked: totalWatchMinutes >= 30,
      },
      {
        id: 'getting-cozy',
        unlocked: totalWatchMinutes >= 120,
      },
      {
        id: 'dedicated-viewer',
        unlocked: totalWatchMinutes >= 600,
      },
      {
        id: 'stream-veteran',
        unlocked: totalWatchMinutes >= 3000,
      },
      {
        id: 'ride-or-die',
        unlocked: totalWatchMinutes >= 12000,
      },
    )

    // Multi-Stream Hopper: 2+ different sessions in last 24 hours
    statuses.push({
      id: 'multi-stream-hopper',
      unlocked: recentSessionIdSet.size >= 2,
    })

    // Dashboard Addict
    statuses.push({
      id: 'dashboard-addict',
      unlocked: loginDaysThisMonth.size >= 7,
    })

    // Raffle achievements
    statuses.push(
      {
        id: 'raffle-participant',
        unlocked: rafflesEntered >= 1,
      },
      {
        id: 'lucky-winner',
        unlocked: rafflesWon >= 1,
      },
    )

    // Chat achievements
    statuses.push(
      {
        id: 'first-words',
        unlocked: totalMessages >= 1,
      },
      {
        id: 'chatterbox',
        unlocked: totalMessages >= 1000,
      },
      {
        id: 'emote-master',
        unlocked: totalEmotes >= 1500,
      },
      {
        id: 'super-social',
        unlocked: totalMessages >= 4000,
      },
      {
        id: 'daily-chatter',
        unlocked: dailyChatDays.size >= 7,
      },
    )

    // Leaderboard / special achievements
    statuses.push(
      {
        id: 'top-g-chatter',
        unlocked: isTopGChatter,
      },
      {
        id: 'og-dash',
        unlocked: isOgDash,
      },
      {
        id: 'sf-legend-of-the-month',
        unlocked: isMonthlyLegend,
      },
    )

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
