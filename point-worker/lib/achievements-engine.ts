import { ACHIEVEMENTS, type AchievementDefinition } from './achievements'
import { db } from './db'
import type { AchievementStatus } from '@prisma/client'

// Map old kebab-case IDs to new SCREAMING_SNAKE_CASE IDs
const ID_MAP: Record<string, string> = {
  'stream-starter': 'STREAM_STARTER',
  'getting-cozy': 'GETTING_COZY',
  'dedicated-viewer': 'DEDICATED_VIEWER',
  'stream-veteran': 'STREAM_VETERAN',
  'ride-or-die': 'RIDE_OR_DIE',
  'multi-stream-hopper': 'MULTI_STREAM_HOPPER',
  'dashboard-addict': 'DASHBOARD_ADDICT',
  'discord-connected': 'DISCORD_CONNECTED',
  'telegram-connected': 'TELEGRAM_CONNECTED',
  'twitter-connected': 'TWITTER_CONNECTED',
  'instagram-connected': 'INSTAGRAM_CONNECTED',
  'custom-profile-picture': 'CUSTOM_PROFILE_PICTURE',
  'first-words': 'FIRST_WORDS',
  'chatterbox': 'CHATTERBOX',
  'emote-master': 'EMOTE_MASTER',
  'super-social': 'SUPER_SOCIAL',
  'daily-chatter': 'DAILY_CHATTER',
  'top-g-chatter': 'TOP_G_CHATTER',
  'og-dash': 'OG_DASH',
  'sf-legend-of-the-month': 'SF_LEGEND_OF_THE_MONTH',
}

// Reverse map for backward compatibility
const REVERSE_ID_MAP: Record<string, string> = Object.fromEntries(
  Object.entries(ID_MAP).map(([k, v]) => [v, k])
)

export function normalizeAchievementId(id: string): string {
  return ID_MAP[id] || id
}

export function toKebabCaseId(id: string): string {
  return REVERSE_ID_MAP[id] || id
}

export function makeAchievementClaimKey(achievementId: string, userId: bigint): string {
  const normalizedId = normalizeAchievementId(achievementId)
  return `achievement:${normalizedId}:${userId.toString()}`
}

interface UnlockContext {
  userId: bigint
  kickUserId: bigint
  user: {
    id: bigint
    created_at: Date
    discord_connected: boolean
    telegram_connected: boolean
    twitter_connected: boolean
    instagram_connected: boolean
    custom_profile_picture_url: string | null
  }
  totalWatchMinutes: number
  recentSessionCount: number // distinct sessions in last 24h
  loginDaysThisMonth: number
  totalMessages: number
  totalEmotes: number
  dailyChatDaysCount: number
  isTopGChatter: boolean
  isMonthlyLegend: boolean
  isOgDash: boolean
}

/**
 * Compute which achievements should be unlocked based on user's current state.
 * Returns a map of achievement ID -> whether it should be unlocked.
 */
function computeUnlockStates(ctx: UnlockContext): Record<string, boolean> {
  const unlocks: Record<string, boolean> = {}

  // Stream time thresholds
  unlocks['STREAM_STARTER'] = ctx.totalWatchMinutes >= 30
  unlocks['GETTING_COZY'] = ctx.totalWatchMinutes >= 120
  unlocks['DEDICATED_VIEWER'] = ctx.totalWatchMinutes >= 600
  unlocks['STREAM_VETERAN'] = ctx.totalWatchMinutes >= 3000
  unlocks['RIDE_OR_DIE'] = ctx.totalWatchMinutes >= 12000

  // Multi-Stream Hopper
  unlocks['MULTI_STREAM_HOPPER'] = ctx.recentSessionCount >= 2

  // Dashboard Addict
  unlocks['DASHBOARD_ADDICT'] = ctx.loginDaysThisMonth >= 7

  // Social connected
  unlocks['DISCORD_CONNECTED'] = ctx.user.discord_connected === true
  unlocks['TELEGRAM_CONNECTED'] = ctx.user.telegram_connected === true
  unlocks['TWITTER_CONNECTED'] = ctx.user.twitter_connected === true
  unlocks['INSTAGRAM_CONNECTED'] = ctx.user.instagram_connected === true
  unlocks['CUSTOM_PROFILE_PICTURE'] =
    !!ctx.user.custom_profile_picture_url &&
    ctx.user.custom_profile_picture_url.trim().length > 0

  // Chat achievements
  unlocks['FIRST_WORDS'] = ctx.totalMessages >= 1
  unlocks['CHATTERBOX'] = ctx.totalMessages >= 1000
  unlocks['EMOTE_MASTER'] = ctx.totalEmotes >= 1500
  unlocks['SUPER_SOCIAL'] = ctx.totalMessages >= 4000
  unlocks['DAILY_CHATTER'] = ctx.dailyChatDaysCount >= 7

  // Leaderboard / special achievements
  unlocks['TOP_G_CHATTER'] = ctx.isTopGChatter
  unlocks['OG_DASH'] = ctx.isOgDash
  unlocks['SF_LEGEND_OF_THE_MONTH'] = ctx.isMonthlyLegend

  return unlocks
}

/**
 * Evaluate achievements for a user and persist unlocks to UserAchievement table.
 * Does NOT claim achievements - user must explicitly claim.
 * Never downgrades UNLOCKED/CLAIMED back to LOCKED.
 */
export async function evaluateAchievementsForUser(
  auth: { userId: bigint; kickUserId: bigint }
): Promise<{ unlocked: string[]; newlyUnlocked: string[] }> {
  const ctx = await gatherUnlockContext(auth)
  if (!ctx) {
    return { unlocked: [], newlyUnlocked: [] }
  }

  const shouldUnlock = computeUnlockStates(ctx)
  const now = new Date()

  // Get existing UserAchievement rows
  const existing = await (db as any).userAchievement.findMany({
    where: { user_id: auth.userId },
    select: { achievement_id: true, status: true },
  })

  const existingMap = new Map((existing as any[]).map((e: any) => [e.achievement_id, e.status]))

  const unlocked: string[] = []
  const newlyUnlocked: string[] = []

  for (const [achievementId, shouldBe] of Object.entries(shouldUnlock)) {
    const currentStatus = existingMap.get(achievementId)

    if (shouldBe) {
      unlocked.push(achievementId)

      if (!currentStatus) {
        // Create as UNLOCKED - wrap in try/catch to handle missing AchievementDefinition
        try {
          await (db as any).userAchievement.create({
            data: {
              user_id: auth.userId,
              achievement_id: achievementId,
              status: 'UNLOCKED',
              unlocked_at: now,
            },
          })
          newlyUnlocked.push(achievementId)
        } catch (e: any) {
          // Ignore foreign key errors - achievement definition may not exist yet
          if (e?.code !== 'P2003') {
            console.error(`[Achievements] Failed to create unlock for ${achievementId}:`, e?.message)
          }
        }
      } else if (currentStatus === 'LOCKED') {
        // Upgrade to UNLOCKED
        try {
          await (db as any).userAchievement.update({
            where: {
              user_id_achievement_id: {
                user_id: auth.userId,
                achievement_id: achievementId,
              },
            },
            data: {
              status: 'UNLOCKED',
              unlocked_at: now,
            },
          })
          newlyUnlocked.push(achievementId)
        } catch (e: any) {
          console.error(`[Achievements] Failed to update unlock for ${achievementId}:`, e?.message)
        }
      }
      // If already UNLOCKED or CLAIMED, do nothing
    } else {
      // Achievement not unlocked - skip creating LOCKED rows (they're not useful)
      // This also avoids foreign key errors
    }
  }

  return { unlocked, newlyUnlocked }
}

/**
 * Gather all context needed to evaluate achievement unlocks.
 */
async function gatherUnlockContext(
  auth: { userId: bigint; kickUserId: bigint }
): Promise<UnlockContext | null> {
  const [user, userSweetCoins] = await Promise.all([
    (db as any).user.findUnique({
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
    (db as any).userSweetCoins.findUnique({
      where: { user_id: auth.userId },
      select: {
        total_sweet_coins: true,
        total_emotes: true,
      },
    }),
  ])

  if (!user) {
    return null
  }

  // Fetch all chat messages for this user (count ALL, not just online)
  // Chat achievements should count all messages regardless of stream status
  const messages = await (db as any).chatMessage.findMany({
    where: {
      sender_user_id: auth.kickUserId,
      // Removed sent_when_offline filter - count all messages for achievements
    },
    select: {
      created_at: true,
      stream_session_id: true,
    },
  })
  
  if (messages.length === 0) {
    console.log(`[Achievements] No chat messages found for kickUserId=${auth.kickUserId}`)
  }

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

  // Calculate approximate watch time
  let totalWatchSeconds = 0
  if (sessionIdSet.size > 0) {
    const sessions = await (db as any).streamSession.findMany({
      where: { id: { in: Array.from(sessionIdSet) } },
      select: {
        id: true,
        duration_seconds: true,
        started_at: true,
        ended_at: true,
      },
    })

    totalWatchSeconds = sessions.reduce((sum: number, session: any) => {
      let duration = session.duration_seconds
      if (duration == null) {
        const end = session.ended_at ?? now
        duration = Math.max(0, Math.floor((end.getTime() - session.started_at.getTime()) / 1000))
      }
      return sum + (duration || 0)
    }, 0)
  }

  const totalWatchMinutes = totalWatchSeconds / 60

  // Dashboard Addict: days logged into dashboard this month
  const monthNow = new Date()
  const monthStart = new Date(Date.UTC(monthNow.getUTCFullYear(), monthNow.getUTCMonth(), 1, 0, 0, 0, 0))
  const monthEnd = new Date(Date.UTC(monthNow.getUTCFullYear(), monthNow.getUTCMonth() + 1, 0, 23, 59, 59, 999))

  const sessionsThisMonth = await (db as any).userSession.findMany({
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

  // Global/top-based achievements
  const [topUsersByPoints, monthlyPointAggsRaw] = await Promise.all([
    (db as any).userSweetCoins.findMany({
      take: 3,
      orderBy: {
        total_sweet_coins: 'desc',
      },
      select: { user_id: true },
    }),
    (db as any).sweetCoinHistory.groupBy({
      by: ['user_id'],
      where: {
        earned_at: {
          gte: monthStart,
          lte: monthEnd,
        },
      },
      _sum: {
        sweet_coins_earned: true,
      },
    }),
  ])

  type MonthlyAgg = { user_id: bigint; _sum: { sweet_coins_earned: number | null } }
  const monthlyPointAggs = monthlyPointAggsRaw as MonthlyAgg[]

  const isTopGChatter = (topUsersByPoints as any[]).some((u: any) => u.user_id === auth.userId)

  let isMonthlyLegend = false
  if (monthlyPointAggs.length > 0) {
    let maxSweetCoins = 0
    for (const agg of monthlyPointAggs) {
      const coins = agg._sum.sweet_coins_earned || 0
      if (coins > maxSweetCoins) maxSweetCoins = coins
    }
    const topUsers = monthlyPointAggs.filter(
      (agg) => (agg._sum.sweet_coins_earned || 0) === maxSweetCoins
    )
    isMonthlyLegend = topUsers.some((agg) => agg.user_id === auth.userId)
  }

  // OG Dash: one of the first 100 users created
  let isOgDash = false
  if (user.created_at) {
    const earlierCount = await (db as any).user.count({
      where: {
        created_at: {
          lt: user.created_at,
        },
      },
    })
    isOgDash = earlierCount < 100
  }

  const totalEmotes = userSweetCoins?.total_emotes || 0

  console.log(`[Achievements] Context for kickUserId=${auth.kickUserId}: messages=${totalMessages}, watchMinutes=${Math.round(totalWatchMinutes)}, emotes=${totalEmotes}, loginDays=${loginDaysThisMonth.size}, chatDays=${dailyChatDays.size}`)

  return {
    userId: auth.userId,
    kickUserId: auth.kickUserId,
    user,
    totalWatchMinutes,
    recentSessionCount: recentSessionIdSet.size,
    loginDaysThisMonth: loginDaysThisMonth.size,
    totalMessages,
    totalEmotes,
    dailyChatDaysCount: dailyChatDays.size,
    isTopGChatter,
    isMonthlyLegend,
    isOgDash,
  }
}

/**
 * Compute achievement unlocks for display purposes (backward compatible).
 * Returns computed unlock states without persisting.
 */
export async function computeAchievementUnlocks(auth: { userId: bigint; kickUserId: bigint }) {
  const ctx = await gatherUnlockContext(auth)
  if (!ctx) {
    return { user: null, unlockedById: {} as Record<string, boolean> }
  }

  const unlocks = computeUnlockStates(ctx)

  // Convert to kebab-case IDs for backward compatibility with existing frontend
  const unlockedById: Record<string, boolean> = {}
  for (const a of ACHIEVEMENTS) {
    const normalizedId = normalizeAchievementId(a.id)
    unlockedById[a.id] = unlocks[normalizedId] === true
  }

  return { user: ctx.user, unlockedById }
}

/**
 * Get the count of unlocked achievements for a user.
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

/**
 * Get all achievement statuses for a user.
 * Returns both computed unlocks and claimed status from (db as any).
 */
export async function getAchievementStatuses(auth: { userId: bigint; kickUserId: bigint }): Promise<{
  achievements: Array<{
    id: string
    status: 'LOCKED' | 'UNLOCKED' | 'CLAIMED'
    unlocked_at: Date | null
    claimed_at: Date | null
  }>
}> {
  // First evaluate and persist any new unlocks - also get computed states
  const { unlocked: computedUnlocks } = await evaluateAchievementsForUser(auth)
  const computedUnlockSet = new Set(computedUnlocks)

  // Get current status from DB
  const userAchievements = await (db as any).userAchievement.findMany({
    where: { user_id: auth.userId },
    select: {
      achievement_id: true,
      status: true,
      unlocked_at: true,
      claimed_at: true,
    },
  })

  const statusMap = new Map(
    (userAchievements as any[]).map((ua: any) => [
      ua.achievement_id,
      {
        status: ua.status as 'LOCKED' | 'UNLOCKED' | 'CLAIMED',
        unlocked_at: ua.unlocked_at,
        claimed_at: ua.claimed_at,
      },
    ])
  )

  // Also check SweetCoinHistory for claims made before migration
  const claimKeys = ACHIEVEMENTS.map((a) => makeAchievementClaimKey(a.id, auth.userId))
  const legacyClaims = await (db as any).sweetCoinHistory.findMany({
    where: {
      user_id: auth.userId,
      message_id: { in: claimKeys },
    },
    select: { message_id: true },
  })
  const legacyClaimSet = new Set((legacyClaims as any[]).map((c: any) => c.message_id).filter(Boolean))

  const achievements = ACHIEVEMENTS.map((a) => {
    const normalizedId = normalizeAchievementId(a.id)
    const dbStatus = statusMap.get(normalizedId)
    const claimKey = makeAchievementClaimKey(a.id, auth.userId)
    const hasLegacyClaim = legacyClaimSet.has(claimKey)
    const isComputedUnlocked = computedUnlockSet.has(normalizedId)

    // Check if claimed (either in DB or legacy)
    if (hasLegacyClaim || dbStatus?.status === 'CLAIMED') {
      return {
        id: a.id,
        status: 'CLAIMED' as const,
        unlocked_at: dbStatus?.unlocked_at || null,
        claimed_at: dbStatus?.claimed_at || null,
      }
    }

    // Check if unlocked (either in DB or computed)
    if (dbStatus?.status === 'UNLOCKED' || isComputedUnlocked) {
      return {
        id: a.id,
        status: 'UNLOCKED' as const,
        unlocked_at: dbStatus?.unlocked_at || null,
        claimed_at: null,
      }
    }

    return {
      id: a.id,
      status: 'LOCKED' as const,
      unlocked_at: null,
      claimed_at: null,
    }
  })

  return { achievements }
}
