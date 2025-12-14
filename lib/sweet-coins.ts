import { db } from '@/lib/db'
import { Prisma } from '@prisma/client'

const verboseSweetCoinsLogging = process.env.CHAT_SAVE_VERBOSE_LOGS === 'true'

const logDebug = (...args: Parameters<typeof console.debug>) => {
    if (verboseSweetCoinsLogging) {
        console.debug(...args)
    }
}

const BOT_USERNAMES = ['botrix', 'kickbot', 'sweetflipsbot']
const SWEET_COINS_PER_MESSAGE_NORMAL = 1
const SWEET_COINS_PER_MESSAGE_SUBSCRIBER = 1
const RATE_LIMIT_SECONDS = 300 // 5 minutes

export function isBot(username: string): boolean {
    return BOT_USERNAMES.some(bot => username.toLowerCase() === bot.toLowerCase())
}

export function isSubscriber(badges: Array<{ text: string; type: string; count?: number }> | null | undefined): boolean {
    if (!badges || !Array.isArray(badges)) return false

    // Check for subscriber-related badges
    const subscriberBadgeTypes = ['subscriber', 'sub_gifter', 'founder', 'sub']
    return badges.some(badge =>
        subscriberBadgeTypes.some(type =>
            badge.type?.toLowerCase().includes(type) ||
            badge.text?.toLowerCase().includes('sub')
        )
    )
}

/**
 * Helper for DB queries with retry logic for connection pool exhaustion
 */
async function dbQueryWithRetry<T>(operation: () => Promise<T>, maxRetries = 3): Promise<T> {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            return await operation()
        } catch (error: any) {
            const isRetryableError = error?.code === 'P2024' ||
                                    error?.message?.includes('connection pool')
            if (isRetryableError && attempt < maxRetries - 1) {
                await new Promise(resolve => setTimeout(resolve, 100 * Math.pow(2, attempt)))
                continue
            }
            throw error
        }
    }
    throw new Error('Max retries exceeded')
}

export async function awardSweetCoins(
    kickUserId: bigint,
    streamSessionId: bigint | null,
    messageId: string | null,
    badges?: Array<{ text: string; type: string; count?: number }> | null
): Promise<{ awarded: boolean; sweetCoinsEarned?: number; reason?: string }> {
    try {
        // First, find the user by kick_user_id to get the internal id, kick_connected status, last_login_at, and username
        const user = await dbQueryWithRetry(() => db.user.findUnique({
            where: { kick_user_id: kickUserId },
            select: { id: true, kick_connected: true, last_login_at: true, username: true, is_excluded: true },
        }))

        if (!user) {
            logDebug(`⏸️ Sweet Coins not awarded to kick_user_id ${kickUserId}: User not found`)
            return {
                awarded: false,
                reason: 'User not found',
            }
        }

        // Exclude bots and excluded users
        const usernameLower = user.username.toLowerCase()
        if (usernameLower === 'sweetflipsbot' || user.is_excluded) {
            logDebug(`⏸️ Sweet Coins not awarded to ${user.username}: Bot or excluded user`)
            return {
                awarded: false,
                sweetCoinsEarned: 0,
                reason: usernameLower === 'sweetflipsbot' ? 'Bot account' : 'Excluded user',
            }
        }

        // Block only if explicitly marked as not connected
        // Allow sweet coins for users who chat (even if they haven't logged in via OAuth)
        if (user.kick_connected === false) {
            logDebug(`⏸️ Sweet Coins not awarded to ${user.username}: Kick account not connected`)
            return {
                awarded: false,
                sweetCoinsEarned: 0,
                reason: 'Kick account not connected',
            }
        }

        const userId = user.id

        // Get or create user sweet coins record (use upsert to handle race conditions)
        let userSweetCoins
        try {
            userSweetCoins = await dbQueryWithRetry(() => db.userSweetCoins.upsert({
                where: { user_id: userId },
                update: {},
                create: {
                    user_id: userId,
                    total_sweet_coins: 0,
                    total_emotes: 0,
                },
            }))
        } catch (error) {
            // Handle race condition where multiple requests try to create the same record
            if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
                // Record already exists, fetch it
                userSweetCoins = await dbQueryWithRetry(() => db.userSweetCoins.findUnique({
                    where: { user_id: userId },
                }))
                if (!userSweetCoins) {
                    // Shouldn't happen, but handle gracefully
                    return {
                        awarded: false,
                        sweetCoinsEarned: 0,
                        reason: 'Failed to retrieve user sweet coins',
                    }
                }
            } else {
                // Re-throw other errors
                throw error
            }
        }

        // If no stream session, award 0 sweet coins (offline)
        if (!streamSessionId) {
            logDebug(`⏸️ Sweet Coins not awarded to ${user.username}: Stream is offline`)
            return {
                awarded: false,
                sweetCoinsEarned: 0,
                reason: 'Stream is offline',
            }
        }

        // Verify the session exists and is actually active (not ended)
        // Fetch fresh from database to avoid race conditions
        const session = await dbQueryWithRetry(() => db.streamSession.findUnique({
            where: { id: streamSessionId },
            select: {
                ended_at: true,
                broadcaster_user_id: true,
            },
        }))

        // If session doesn't exist or has ended, don't award sweet coins
        if (!session || session.ended_at !== null) {
            logDebug(`⏸️ Sweet Coins not awarded to ${user.username}: Stream session has ended`)
            return {
                awarded: false,
                sweetCoinsEarned: 0,
                reason: 'Stream session has ended',
            }
        }

        // Early check for message_id uniqueness (quick exit before transaction)
        if (messageId) {
            const existingSweetCoinHistory = await dbQueryWithRetry(() => db.sweetCoinHistory.findFirst({
                where: { message_id: messageId },
                select: { sweet_coins_earned: true },
            }))

            if (existingSweetCoinHistory) {
                logDebug(`⏸️ Sweet Coins not awarded to ${user.username}: Message already processed for sweet coins`)
                return {
                    awarded: false,
                    sweetCoinsEarned: existingSweetCoinHistory.sweet_coins_earned ?? 0,
                    reason: 'Message already processed for sweet coins',
                }
            }
        }

        // Determine sweet coins based on subscription status
        const isSub = isSubscriber(badges)
        const sweetCoinsToAward = isSub ? SWEET_COINS_PER_MESSAGE_SUBSCRIBER : SWEET_COINS_PER_MESSAGE_NORMAL

        // Retry transaction with exponential backoff for P2028 (transaction timeout)
        const maxRetries = 3
        let transactionSucceeded = false
        let rateLimitHit: { remainingMinutes: number; remainingSecs: number } | null = null

        for (let attempt = 0; attempt < maxRetries; attempt++) {
            // Reset rateLimitHit for each attempt
            rateLimitHit = null
            const attemptStartTime = Date.now()
            try {
                await db.$transaction(async (tx) => {
                    const transactionNow = new Date()

                    // Use row-level locking (SELECT FOR UPDATE) to prevent concurrent modifications
                    // This ensures only one transaction can read and update a user's sweet coins at a time
                    const lockedUserSweetCoins = await tx.$queryRaw<Array<{
                        id: bigint
                        user_id: bigint
                        last_sweet_coin_earned_at: Date | null
                        total_sweet_coins: number
                    }>>`
                        SELECT id, user_id, last_sweet_coin_earned_at, total_sweet_coins
                        FROM user_sweet_coins
                        WHERE user_id = ${userId}
                        FOR UPDATE
                    `

                    const freshUserSweetCoins = lockedUserSweetCoins.length > 0 ? {
                        last_sweet_coin_earned_at: lockedUserSweetCoins[0].last_sweet_coin_earned_at,
                    } : null

                    // Log transaction attempt details (behind verbose flag)
                    logDebug(`[awardSweetCoins] Transaction attempt ${attempt + 1}: userId=${userId}, messageId=${messageId}, last_sweet_coin_earned_at=${freshUserSweetCoins?.last_sweet_coin_earned_at || 'null'}, isolation=READ_COMMITTED`)

                    if (freshUserSweetCoins?.last_sweet_coin_earned_at) {
                        const timeSinceLastSweetCoin = (transactionNow.getTime() - freshUserSweetCoins.last_sweet_coin_earned_at.getTime()) / 1000
                        logDebug(`[awardSweetCoins] Rate limit check: timeSinceLastSweetCoin=${timeSinceLastSweetCoin}s, limit=${RATE_LIMIT_SECONDS}s`)
                        if (timeSinceLastSweetCoin < RATE_LIMIT_SECONDS) {
                            const remainingSeconds = Math.ceil(RATE_LIMIT_SECONDS - timeSinceLastSweetCoin)
                            rateLimitHit = {
                                remainingMinutes: Math.floor(remainingSeconds / 60),
                                remainingSecs: remainingSeconds % 60,
                            }
                            logDebug(`[awardSweetCoins] Rate limit hit: ${rateLimitHit.remainingMinutes}m ${rateLimitHit.remainingSecs}s remaining`)
                            // Return early from transaction - no writes will happen
                            return
                        }
                    }

                    // Double-check message_id uniqueness inside transaction (defense in depth)
                    if (messageId) {
                        const existingHistory = await tx.sweetCoinHistory.findFirst({
                            where: { message_id: messageId },
                            select: { id: true },
                        })
                        if (existingHistory) {
                            logDebug(`[awardSweetCoins] Message already processed: messageId=${messageId}`)
                            // Message already processed - return without writing
                            return
                        }
                    }

                    // All checks passed - create sweetCoinHistory and update userSweetCoins atomically
                    await tx.sweetCoinHistory.create({
                        data: {
                            user_id: userId,
                            stream_session_id: streamSessionId,
                            sweet_coins_earned: sweetCoinsToAward,
                            message_id: messageId,
                            earned_at: transactionNow,
                        },
                    })

                    await tx.userSweetCoins.update({
                        where: { user_id: userId },
                        data: {
                            total_sweet_coins: {
                                increment: sweetCoinsToAward,
                            },
                            last_sweet_coin_earned_at: transactionNow,
                            is_subscriber: isSub,
                            updated_at: transactionNow,
                        },
                    })

                    const transactionDuration = Date.now() - attemptStartTime
                    logDebug(`[awardSweetCoins] Transaction succeeded: userId=${userId}, messageId=${messageId}, sweetCoins=${sweetCoinsToAward}, duration=${transactionDuration}ms`)
                }, {
                    maxWait: 20000, // Wait up to 20 seconds for transaction to start (increased for high contention)
                    timeout: 30000, // Transaction timeout of 30 seconds (increased for high contention)
                    isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, // Use READ COMMITTED - less contention, sufficient for our use case
                })

                // Check if rate limit was hit (transaction completed but no writes happened)
                if (rateLimitHit !== null) {
                    const { remainingMinutes, remainingSecs } = rateLimitHit
                    logDebug(`⏸️ Sweet Coins not awarded to ${user.username}: Rate limit (${remainingMinutes}m ${remainingSecs}s remaining)`)
                    return {
                        awarded: false,
                        sweetCoinsEarned: 0,
                        reason: `Rate limit: ${remainingMinutes}m ${remainingSecs}s remaining`,
                    }
                }

                // Success - mark and break out of retry loop
                transactionSucceeded = true
                break
            } catch (transactionError) {
                const attemptDuration = Date.now() - attemptStartTime

                // Handle unique constraint violation (race condition on message_id)
                if (transactionError instanceof Prisma.PrismaClientKnownRequestError && transactionError.code === 'P2002') {
                    logDebug(`[awardSweetCoins] Unique constraint violation (race condition): userId=${userId}, messageId=${messageId}, attempt=${attempt + 1}, duration=${attemptDuration}ms`)
                    logDebug(`⏸️ Sweet Coins not awarded to ${user.username}: Message already processed for sweet coins (race condition)`)
                    return {
                        awarded: false,
                        sweetCoinsEarned: 0,
                        reason: 'Message already processed for sweet coins',
                    }
                }

                // Handle transaction timeout - retry with exponential backoff
                if (transactionError instanceof Prisma.PrismaClientKnownRequestError && transactionError.code === 'P2028') {
                    logDebug(`[awardSweetCoins] Transaction timeout: userId=${userId}, messageId=${messageId}, attempt=${attempt + 1}/${maxRetries}, duration=${attemptDuration}ms`)
                    if (attempt < maxRetries - 1) {
                        const delay = Math.min(100 * Math.pow(2, attempt), 1000) // 100ms, 200ms, 400ms max
                        logDebug(`[awardSweetCoins] Retrying after ${delay}ms delay...`)
                        await new Promise(resolve => setTimeout(resolve, delay))
                        continue // Retry
                    }
                    // Max retries reached
                    console.error(`Error awarding sweet coins: Transaction timeout after ${maxRetries} attempts (userId=${userId}, messageId=${messageId})`, transactionError)
                    return {
                        awarded: false,
                        sweetCoinsEarned: 0,
                        reason: 'Transaction timeout - please try again',
                    }
                }

                // Handle connection pool (P2024), serialization (P4001), deadlock (P2034), concurrent update (P2010) - retry
                const isSerializationError = transactionError instanceof Prisma.PrismaClientKnownRequestError &&
                    (transactionError.code === 'P2024' || transactionError.code === 'P4001' || transactionError.code === 'P2034' || transactionError.code === 'P2010') ||
                    (transactionError instanceof Error && (
                        transactionError.message.includes('could not serialize access') ||
                        transactionError.message.includes('concurrent update') ||
                        transactionError.message.includes('connection pool')
                    ))

                if (isSerializationError) {
                    const errorCode = transactionError instanceof Prisma.PrismaClientKnownRequestError ? transactionError.code : 'UNKNOWN'
                    const errorType = errorCode === 'P4001' ? 'serialization' : errorCode === 'P2034' ? 'deadlock' : 'concurrent update'
                    logDebug(`[awardSweetCoins] Serialization failure (${errorType}): userId=${userId}, messageId=${messageId}, attempt=${attempt + 1}/${maxRetries}, duration=${attemptDuration}ms`)
                    if (attempt < maxRetries - 1) {
                        const delay = Math.min(100 * Math.pow(2, attempt), 1000)
                        logDebug(`[awardSweetCoins] Retrying after ${delay}ms delay...`)
                        await new Promise(resolve => setTimeout(resolve, delay))
                        continue // Retry
                    }
                    console.error(`Error awarding sweet coins: Serialization failure (${errorType}) after ${maxRetries} attempts (userId=${userId}, messageId=${messageId})`, transactionError)
                    return {
                        awarded: false,
                        sweetCoinsEarned: 0,
                        reason: 'Transaction conflict - please try again',
                    }
                }

                // Log other transaction errors with context
                logDebug(`[awardSweetCoins] Transaction error: userId=${userId}, messageId=${messageId}, attempt=${attempt + 1}, duration=${attemptDuration}ms, error=${transactionError instanceof Error ? transactionError.message : 'Unknown'}`)

                // For other errors, throw immediately
                throw transactionError
            }
        }

        // If transaction didn't succeed and we didn't return early, something went wrong
        if (!transactionSucceeded) {
            return {
                awarded: false,
                sweetCoinsEarned: 0,
                reason: 'Transaction failed after retries',
            }
        }

        // Trigger referral reward check asynchronously (non-blocking)
        // This checks if the user has reached any referral milestones
        (async () => {
            try {
                await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'https://kickdashboard.com'}/api/referrals/claim`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ refereeUserId: userId }),
                })
            } catch (error) {
                // Non-critical - log but don't fail the main operation
                logDebug(`[awardSweetCoins] Could not trigger referral rewards check: ${error instanceof Error ? error.message : 'Unknown error'}`)
            }
        })()

        return {
            awarded: true,
            sweetCoinsEarned: sweetCoinsToAward
        }
    } catch (error) {
        console.error('Error awarding sweet coins:', error)
        return {
            awarded: false,
            reason: error instanceof Error ? error.message : 'Unknown error',
        }
    }
}

export async function awardEmotes(
    kickUserId: bigint,
    emotes: Array<{ emote_id: string; positions: Array<{ s: number; e: number }> }> | null | undefined
): Promise<{ counted: number }> {
    try {
        if (!emotes || !Array.isArray(emotes) || emotes.length === 0) {
            return { counted: 0 }
        }

        // Count total emote occurrences (sum of all positions)
        const totalEmotes = emotes.reduce((total, emote) => {
            return total + (emote.positions?.length || 0)
        }, 0)

        if (totalEmotes === 0) {
            return { counted: 0 }
        }

        // Find the user by kick_user_id to get the internal id
        const user = await dbQueryWithRetry(() => db.user.findUnique({
            where: { kick_user_id: kickUserId },
            select: { id: true },
        }))

        if (!user) {
            return { counted: 0 }
        }

        const userId = user.id

        // Get or create user sweet coins record (use upsert to handle race conditions)
        let userSweetCoins
        try {
            userSweetCoins = await dbQueryWithRetry(() => db.userSweetCoins.upsert({
                where: { user_id: userId },
                update: {},
                create: {
                    user_id: userId,
                    total_sweet_coins: 0,
                    total_emotes: 0,
                },
            }))
        } catch (error) {
            // Handle race condition where multiple requests try to create the same record
            if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
                // Record already exists, fetch it
                userSweetCoins = await dbQueryWithRetry(() => db.userSweetCoins.findUnique({
                    where: { user_id: userId },
                }))
                if (!userSweetCoins) {
                    // Shouldn't happen, but handle gracefully
                    return { counted: 0 }
                }
            } else {
                // Re-throw other errors
                throw error
            }
        }

        // Update emote count (with retry for connection pool)
        await dbQueryWithRetry(() => db.userSweetCoins.update({
            where: { user_id: userId },
            data: {
                total_emotes: {
                    increment: totalEmotes,
                },
                updated_at: new Date(),
            },
        }))

        logDebug(`✅ Awarded ${totalEmotes} emote(s) to user ${kickUserId} (total_emotes incremented)`)

        return { counted: totalEmotes }
    } catch (error) {
        console.error('Error awarding emotes:', error)
        return { counted: 0 }
    }
}

export async function getUserSweetCoins(kickUserId: bigint): Promise<number> {
    try {
        const user = await dbQueryWithRetry(() => db.user.findUnique({
            where: { kick_user_id: kickUserId },
            select: { id: true },
        }))

        if (!user) {
            return 0
        }

        const userSweetCoins = await dbQueryWithRetry(() => db.userSweetCoins.findUnique({
            where: { user_id: user.id },
        }))
        return userSweetCoins?.total_sweet_coins || 0
    } catch (error) {
        console.error('Error getting user sweet coins:', error)
        return 0
    }
}

// Legacy exports for backward compatibility during migration
export const awardPoint = awardSweetCoins
export const getUserPoints = getUserSweetCoins
