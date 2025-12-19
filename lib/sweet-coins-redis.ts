import { redis } from './redis'
import { db } from './db'

// Rate limit between coin awards per user (configurable via env)
// Lower = more real-time engagement, Higher = less spam potential
const RATE_LIMIT_SECONDS = parseInt(process.env.COIN_RATE_LIMIT_SECONDS || '30', 10) // 30 seconds (was 5 minutes)

/**
 * Award sweet coins instantly using Redis counters
 * Returns immediately (< 1ms) - actual DB sync happens in background
 */
export async function awardCoins(
  userId: bigint,
  amount: number,
  sessionId: bigint | null
): Promise<{ awarded: boolean; newBalance: number; reason?: string }> {
  try {
    const userIdStr = userId.toString()
    const sessionIdStr = sessionId?.toString() || 'none'

    // Check rate limit
    const rateLimitKey = `rate:${userIdStr}`
    const lastAward = await redis.get(rateLimitKey)
    const now = Date.now()

    if (lastAward) {
      const timeSinceLastAward = now - parseInt(lastAward, 10)
      if (timeSinceLastAward < RATE_LIMIT_SECONDS * 1000) {
        const remainingSecs = Math.ceil((RATE_LIMIT_SECONDS * 1000 - timeSinceLastAward) / 1000)
        return {
          awarded: false,
          newBalance: await getBalance(userId),
          reason: `Rate limited (${remainingSecs}s remaining)`,
        }
      }
    }

    // Use pipeline for atomic operations
    const pipeline = redis.pipeline()

    // Update total balance
    pipeline.incrby(`coins:${userIdStr}`, amount)

    // Update session earnings if session exists
    if (sessionId) {
      pipeline.incrby(`session:${sessionIdStr}:${userIdStr}`, amount)
      // Update leaderboard sorted set
      pipeline.zincrby(`leaderboard:${sessionIdStr}`, amount, userIdStr)
    }

    // Update rate limit timestamp
    pipeline.setex(rateLimitKey, RATE_LIMIT_SECONDS, now.toString())

    // Execute pipeline
    const results = await pipeline.exec()

    if (!results) {
      throw new Error('Pipeline execution failed')
    }

    // Get new balance from first result
    const balanceResult = results[0]
    const newBalance = balanceResult?.[1] ? parseInt(balanceResult[1] as string, 10) : await getBalance(userId)

    return {
      awarded: true,
      newBalance,
    }
  } catch (error) {
    console.error('[sweet-coins-redis] Error awarding coins:', error)
    return {
      awarded: false,
      newBalance: await getBalance(userId).catch(() => 0),
      reason: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Get current balance from Redis (instant read)
 */
export async function getBalance(userId: bigint): Promise<number> {
  try {
    const balance = await redis.get(`coins:${userId.toString()}`)
    return balance ? parseInt(balance, 10) : 0
  } catch (error) {
    console.error('[sweet-coins-redis] Error getting balance:', error)
    return 0
  }
}

/**
 * Deduct coins (for shop purchases)
 */
export async function deductCoins(userId: bigint, amount: number): Promise<{ success: boolean; newBalance: number; error?: string }> {
  try {
    const userIdStr = userId.toString()
    const newBalance = await redis.decrby(`coins:${userIdStr}`, amount)

    if (newBalance < 0) {
      // Rollback if insufficient funds
      await redis.incrby(`coins:${userIdStr}`, amount)
      return {
        success: false,
        newBalance: await getBalance(userId),
        error: 'Insufficient funds',
      }
    }

    return {
      success: true,
      newBalance,
    }
  } catch (error) {
    console.error('[sweet-coins-redis] Error deducting coins:', error)
    return {
      success: false,
      newBalance: await getBalance(userId).catch(() => 0),
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Get session leaderboard (top N users)
 */
export async function getSessionLeaderboard(sessionId: bigint, limit: number = 10): Promise<Array<{ userId: bigint; coins: number }>> {
  try {
    const sessionIdStr = sessionId.toString()
    const results = await redis.zrevrange(`leaderboard:${sessionIdStr}`, 0, limit - 1, 'WITHSCORES')

    const leaderboard: Array<{ userId: bigint; coins: number }> = []
    for (let i = 0; i < results.length; i += 2) {
      const userIdStr = results[i] as string
      const coins = parseFloat(results[i + 1] as string)
      leaderboard.push({
        userId: BigInt(userIdStr),
        coins: Math.floor(coins),
      })
    }

    return leaderboard
  } catch (error) {
    console.error('[sweet-coins-redis] Error getting leaderboard:', error)
    return []
  }
}

/**
 * Get session earnings for a specific user
 */
export async function getSessionEarnings(userId: bigint, sessionId: bigint): Promise<number> {
  try {
    const sessionIdStr = sessionId.toString()
    const userIdStr = userId.toString()
    const earnings = await redis.get(`session:${sessionIdStr}:${userIdStr}`)
    return earnings ? parseInt(earnings, 10) : 0
  } catch (error) {
    console.error('[sweet-coins-redis] Error getting session earnings:', error)
    return 0
  }
}

/**
 * Get all users with balances (for sync)
 */
export async function getAllBalances(): Promise<Array<{ userId: bigint; balance: number }>> {
  try {
    const keys = await redis.keys('coins:*')
    if (keys.length === 0) {
      return []
    }

    const pipeline = redis.pipeline()
    keys.forEach(key => pipeline.get(key))
    const results = await pipeline.exec()

    if (!results) {
      return []
    }

    const balances: Array<{ userId: bigint; balance: number }> = []
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i]
      const userIdStr = key.replace('coins:', '')
      const balanceResult = results[i]
      const balance = balanceResult?.[1] ? parseInt(balanceResult[1] as string, 10) : 0

      if (balance > 0) {
        balances.push({
          userId: BigInt(userIdStr),
          balance,
        })
      }
    }

    return balances
  } catch (error) {
    console.error('[sweet-coins-redis] Error getting all balances:', error)
    return []
  }
}

/**
 * Get all session earnings for a specific session (for sync)
 */
export async function getSessionEarningsForSync(sessionId: bigint): Promise<Array<{ userId: bigint; earnings: number }>> {
  try {
    const sessionIdStr = sessionId.toString()
    const keys = await redis.keys(`session:${sessionIdStr}:*`)
    if (keys.length === 0) {
      return []
    }

    const pipeline = redis.pipeline()
    keys.forEach(key => pipeline.get(key))
    const results = await pipeline.exec()

    if (!results) {
      return []
    }

    const earnings: Array<{ userId: bigint; earnings: number }> = []
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i]
      const userIdStr = key.replace(`session:${sessionIdStr}:`, '')
      const earningsResult = results[i]
      const amount = earningsResult?.[1] ? parseInt(earningsResult[1] as string, 10) : 0

      if (amount > 0) {
        earnings.push({
          userId: BigInt(userIdStr),
          earnings: amount,
        })
      }
    }

    return earnings
  } catch (error) {
    console.error('[sweet-coins-redis] Error getting session earnings for sync:', error)
    return []
  }
}

/**
 * Initialize balance from PostgreSQL (for users who already have coins)
 */
export async function initializeBalanceFromDb(userId: bigint): Promise<void> {
  try {
    const user = await db.user.findUnique({
      where: { id: userId },
      include: { sweet_coins: true },
    })

    if (user?.sweet_coins) {
      const currentRedisBalance = await getBalance(userId)
      const dbBalance = user.sweet_coins.total_sweet_coins || 0

      // Only initialize if Redis balance is 0 or missing
      if (currentRedisBalance === 0 && dbBalance > 0) {
        await redis.set(`coins:${userId.toString()}`, dbBalance.toString())
      }
    }
  } catch (error) {
    console.error('[sweet-coins-redis] Error initializing balance from DB:', error)
  }
}
