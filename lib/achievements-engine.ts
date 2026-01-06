import { ACHIEVEMENTS } from '@/lib/achievements';
import { db } from '@/lib/db';

export function makeAchievementClaimKey(achievementId: string, userId: bigint) {
  return `achievement:${achievementId}:${userId.toString()}`
}

export async function computeAchievementUnlocks(auth: { userId: bigint; kickUserId: bigint }) {
  const [user, userSweetCoins] = await Promise.all([
    db.user.findUnique({
      where: { id: auth.userId },
      select: {
        id: true,
        created_at: true,
        discord_connected: true,
        telegram_connected: true,
        twitter_connected: true,
        instagram_connected: true,
        custom_profile_picture_url: true,
      },
    }),
    db.userSweetCoins.findUnique({
      where: { user_id: auth.userId },
      select: {
        total_sweet_coins: true,
        total_emotes: true,
      },
    }),
  ])

  if (!user) {
    return { user: null, unlockedById: {} as Record<string, boolean> }
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

    totalWatchSeconds = (sessions as any[]).reduce((sum: number, session: any) => {
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
  const rafflesEntered = await db.raffleEntry.count({ where: { user_id: auth.userId } })
  const rafflesWon = 0 // Winner tracking table removed

  // Global/top-based achievements
  const [topUsersByPoints, monthlyPointAggs] = await Promise.all([
    db.userSweetCoins.findMany({
      take: 3,
      orderBy: {
        total_sweet_coins: 'desc',
      },
      select: { user_id: true },
    }),
    (async () => {
      // SF Legend of the month: most Sweet Coins earned in current month
      const start = monthStart
      const end = monthEnd
      return db.sweetCoinHistory.groupBy({
        by: ['user_id'],
        where: {
          earned_at: {
            gte: start,
            lte: end,
          },
        },
        _sum: {
          sweet_coins_earned: true,
        },
      })
    })(),
  ])

  const isTopGChatter = (topUsersByPoints as any[]).some((u: any) => u.user_id === auth.userId)

  let isMonthlyLegend = false
  if (monthlyPointAggs.length > 0) {
    let maxSweetCoins = 0
    for (const agg of monthlyPointAggs as Array<{ user_id: bigint; _sum: { sweet_coins_earned: number | null } }>) {
      const coins = agg._sum.sweet_coins_earned || 0
      if (coins > maxSweetCoins) maxSweetCoins = coins
    }
    const topUsers = (monthlyPointAggs as Array<{ user_id: bigint; _sum: { sweet_coins_earned: number | null } }>).filter((agg) => (agg._sum.sweet_coins_earned || 0) === maxSweetCoins)
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

  const totalEmotes = userSweetCoins?.total_emotes || 0

  const unlockedById: Record<string, boolean> = {}

  // Ensure we always return entries for every known achievement id
  for (const a of ACHIEVEMENTS) {
    unlockedById[a.id] = false
  }

  // Stream time thresholds based on total watch minutes
  unlockedById['stream-starter'] = totalWatchMinutes >= 30
  unlockedById['getting-cozy'] = totalWatchMinutes >= 120
  unlockedById['dedicated-viewer'] = totalWatchMinutes >= 600
  unlockedById['stream-veteran'] = totalWatchMinutes >= 3000
  unlockedById['ride-or-die'] = totalWatchMinutes >= 12000

  // Multi-Stream Hopper: 2+ different sessions in last 24 hours
  unlockedById['multi-stream-hopper'] = recentSessionIdSet.size >= 2

  // Dashboard Addict
  unlockedById['dashboard-addict'] = loginDaysThisMonth.size >= 7

  // Social connected
  unlockedById['discord-connected'] = user.discord_connected === true
  unlockedById['telegram-connected'] = user.telegram_connected === true
  unlockedById['twitter-connected'] = user.twitter_connected === true
  unlockedById['instagram-connected'] = user.instagram_connected === true
  unlockedById['custom-profile-picture'] = !!user.custom_profile_picture_url && user.custom_profile_picture_url.trim().length > 0

  // Raffle achievements
  unlockedById['raffle-participant'] = rafflesEntered >= 1
  unlockedById['lucky-winner'] = rafflesWon >= 1

  // Chat achievements
  unlockedById['first-words'] = totalMessages >= 1
  unlockedById['chatterbox'] = totalMessages >= 1000
  unlockedById['emote-master'] = totalEmotes >= 1500
  unlockedById['super-social'] = totalMessages >= 4000
  unlockedById['daily-chatter'] = dailyChatDays.size >= 7

  // Leaderboard / special achievements
  unlockedById['top-g-chatter'] = isTopGChatter
  unlockedById['og-dash'] = isOgDash
  unlockedById['sf-legend-of-the-month'] = isMonthlyLegend

  return { user, unlockedById }
}

/**
 * Get the count of unlocked achievements for a user
 * This is a simplified version that computes achievements and returns the count
 */
export async function getAchievementCount(userId: bigint, kickUserId: bigint): Promise<number> {
  try {
    const { unlockedById } = await computeAchievementUnlocks({ userId, kickUserId })
    return Object.values(unlockedById).filter(Boolean).length
  } catch (error) {
    console.error(`[getAchievementCount] Error computing achievements for user ${userId}:`, error)
    return 0
  }
}
