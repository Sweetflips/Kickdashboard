import { db } from '@/lib/db'
import { Prisma } from '@prisma/client'

const verbosePointsLogging = process.env.CHAT_SAVE_VERBOSE_LOGS === 'true'

const logDebug = (...args: Parameters<typeof console.debug>) => {
    if (verbosePointsLogging) {
        console.debug(...args)
    }
}

const BOT_USERNAMES = ['botrix', 'kickbot']
const POINTS_PER_MESSAGE_NORMAL = 1
const POINTS_PER_MESSAGE_SUBSCRIBER = 2
const RATE_LIMIT_SECONDS = 300 // 5 minutes
const STREAM_START_COOLDOWN_SECONDS = 600 // 10 minutes

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

export async function awardPoint(
    kickUserId: bigint,
    streamSessionId: bigint | null,
    messageId: string | null,
    badges?: Array<{ text: string; type: string; count?: number }> | null
): Promise<{ awarded: boolean; pointsEarned?: number; reason?: string }> {
    try {
        // First, find the user by kick_user_id to get the internal id, kick_connected status, last_login_at, and username
        const user = await db.user.findUnique({
            where: { kick_user_id: kickUserId },
            select: { id: true, kick_connected: true, last_login_at: true, username: true },
        })

        if (!user) {
            logDebug(`⏸️ Point not awarded to kick_user_id ${kickUserId}: User not found`)
            return {
                awarded: false,
                reason: 'User not found',
            }
        }

        // Block only if explicitly marked as not connected
        // Allow points for users who chat (even if they haven't logged in via OAuth)
        if (user.kick_connected === false) {
            logDebug(`⏸️ Point not awarded to ${user.username}: Kick account not connected`)
            return {
                awarded: false,
                pointsEarned: 0,
                reason: 'Kick account not connected',
            }
        }

        const userId = user.id

        // Get or create user points record (use upsert to handle race conditions)
        let userPoints
        try {
            userPoints = await db.userPoints.upsert({
                where: { user_id: userId },
                update: {},
                create: {
                    user_id: userId,
                    total_points: 0,
                    total_emotes: 0,
                },
            })
        } catch (error) {
            // Handle race condition where multiple requests try to create the same record
            if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
                // Record already exists, fetch it
                userPoints = await db.userPoints.findUnique({
                    where: { user_id: userId },
                })
                if (!userPoints) {
                    // Shouldn't happen, but handle gracefully
                    return {
                        awarded: false,
                        pointsEarned: 0,
                        reason: 'Failed to retrieve user points',
                    }
                }
            } else {
                // Re-throw other errors
                throw error
            }
        }

        // If no stream session, award 0 points (offline)
        if (!streamSessionId) {
            logDebug(`⏸️ Point not awarded to ${user.username}: Stream is offline`)
            return {
                awarded: false,
                pointsEarned: 0,
                reason: 'Stream is offline',
            }
        }

        // Verify the session exists and is actually active (not ended)
        // Fetch fresh from database to avoid race conditions
        const session = await db.streamSession.findUnique({
            where: { id: streamSessionId },
            select: {
                ended_at: true,
                broadcaster_user_id: true,
                started_at: true,
            },
        })

        // If session doesn't exist or has ended, don't award points
        if (!session || session.ended_at !== null) {
            logDebug(`⏸️ Point not awarded to ${user.username}: Stream session has ended`)
            return {
                awarded: false,
                pointsEarned: 0,
                reason: 'Stream session has ended',
            }
        }

        // Check if stream has been running for at least 10 minutes
        const now = new Date()
        const timeSinceStreamStart = (now.getTime() - session.started_at.getTime()) / 1000
        if (timeSinceStreamStart < STREAM_START_COOLDOWN_SECONDS) {
            const remainingSeconds = Math.ceil(STREAM_START_COOLDOWN_SECONDS - timeSinceStreamStart)
            const remainingMinutes = Math.floor(remainingSeconds / 60)
            const remainingSecs = remainingSeconds % 60
            logDebug(`⏸️ Point not awarded to ${user.username}: Stream must be live for 10 minutes (${remainingMinutes}m ${remainingSecs}s remaining)`)
            return {
                awarded: false,
                pointsEarned: 0,
                reason: `Points unavailable: Stream must be live for 10 minutes (${remainingMinutes}m ${remainingSecs}s remaining)`,
            }
        }

        // Early check for message_id uniqueness (quick exit before transaction)
        if (messageId) {
            const existingPointHistory = await db.pointHistory.findUnique({
                where: { message_id: messageId },
                select: { points_earned: true },
            })

            if (existingPointHistory) {
                logDebug(`⏸️ Point not awarded to ${user.username}: Message already processed for points`)
                return {
                    awarded: false,
                    pointsEarned: existingPointHistory.points_earned ?? 0,
                    reason: 'Message already processed for points',
                }
            }
        }

        // Determine points based on subscription status
        const isSub = isSubscriber(badges)
        const pointsToAward = isSub ? POINTS_PER_MESSAGE_SUBSCRIBER : POINTS_PER_MESSAGE_NORMAL

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
                    // This ensures only one transaction can read and update a user's points at a time
                    const lockedUserPoints = await tx.$queryRaw<Array<{
                        id: bigint
                        user_id: bigint
                        last_point_earned_at: Date | null
                        total_points: number
                    }>>`
                        SELECT id, user_id, last_point_earned_at, total_points
                        FROM user_points
                        WHERE user_id = ${userId}
                        FOR UPDATE
                    `

                    const freshUserPoints = lockedUserPoints.length > 0 ? {
                        last_point_earned_at: lockedUserPoints[0].last_point_earned_at,
                    } : null

                    // Log transaction attempt details (behind verbose flag)
                    logDebug(`[awardPoint] Transaction attempt ${attempt + 1}: userId=${userId}, messageId=${messageId}, last_point_earned_at=${freshUserPoints?.last_point_earned_at || 'null'}, isolation=SERIALIZABLE`)

                    if (freshUserPoints?.last_point_earned_at) {
                        const timeSinceLastPoint = (transactionNow.getTime() - freshUserPoints.last_point_earned_at.getTime()) / 1000
                        logDebug(`[awardPoint] Rate limit check: timeSinceLastPoint=${timeSinceLastPoint}s, limit=${RATE_LIMIT_SECONDS}s`)
                        if (timeSinceLastPoint < RATE_LIMIT_SECONDS) {
                            const remainingSeconds = Math.ceil(RATE_LIMIT_SECONDS - timeSinceLastPoint)
                            rateLimitHit = {
                                remainingMinutes: Math.floor(remainingSeconds / 60),
                                remainingSecs: remainingSeconds % 60,
                            }
                            logDebug(`[awardPoint] Rate limit hit: ${rateLimitHit.remainingMinutes}m ${rateLimitHit.remainingSecs}s remaining`)
                            // Return early from transaction - no writes will happen
                            return
                        }
                    }

                    // Double-check message_id uniqueness inside transaction (defense in depth)
                    if (messageId) {
                        const existingHistory = await tx.pointHistory.findUnique({
                            where: { message_id: messageId },
                            select: { id: true },
                        })
                        if (existingHistory) {
                            logDebug(`[awardPoint] Message already processed: messageId=${messageId}`)
                            // Message already processed - return without writing
                            return
                        }
                    }

                    // All checks passed - create pointHistory and update userPoints atomically
                    await tx.pointHistory.create({
                        data: {
                            user_id: userId,
                            stream_session_id: streamSessionId,
                            points_earned: pointsToAward,
                            message_id: messageId,
                            earned_at: transactionNow,
                        },
                    })

                    await tx.userPoints.update({
                        where: { user_id: userId },
                        data: {
                            total_points: {
                                increment: pointsToAward,
                            },
                            last_point_earned_at: transactionNow,
                            updated_at: transactionNow,
                        },
                    })

                    const transactionDuration = Date.now() - attemptStartTime
                    logDebug(`[awardPoint] Transaction succeeded: userId=${userId}, messageId=${messageId}, points=${pointsToAward}, duration=${transactionDuration}ms`)
                }, {
                    maxWait: 20000, // Wait up to 20 seconds for transaction to start (increased for high contention)
                    timeout: 30000, // Transaction timeout of 30 seconds (increased for high contention)
                    isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, // Use REPEATABLE READ - sufficient for our use case, less contention than SERIALIZABLE
                })

                // Check if rate limit was hit (transaction completed but no writes happened)
                if (rateLimitHit !== null) {
                    const { remainingMinutes, remainingSecs } = rateLimitHit
                    logDebug(`⏸️ Point not awarded to ${user.username}: Rate limit (${remainingMinutes}m ${remainingSecs}s remaining)`)
                    return {
                        awarded: false,
                        pointsEarned: 0,
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
                    logDebug(`[awardPoint] Unique constraint violation (race condition): userId=${userId}, messageId=${messageId}, attempt=${attempt + 1}, duration=${attemptDuration}ms`)
                    logDebug(`⏸️ Point not awarded to ${user.username}: Message already processed for points (race condition)`)
                    return {
                        awarded: false,
                        pointsEarned: 0,
                        reason: 'Message already processed for points',
                    }
                }

                // Handle transaction timeout - retry with exponential backoff
                if (transactionError instanceof Prisma.PrismaClientKnownRequestError && transactionError.code === 'P2028') {
                    logDebug(`[awardPoint] Transaction timeout: userId=${userId}, messageId=${messageId}, attempt=${attempt + 1}/${maxRetries}, duration=${attemptDuration}ms`)
                    if (attempt < maxRetries - 1) {
                        const delay = Math.min(100 * Math.pow(2, attempt), 1000) // 100ms, 200ms, 400ms max
                        logDebug(`[awardPoint] Retrying after ${delay}ms delay...`)
                        await new Promise(resolve => setTimeout(resolve, delay))
                        continue // Retry
                    }
                    // Max retries reached
                    console.error(`Error awarding point: Transaction timeout after ${maxRetries} attempts (userId=${userId}, messageId=${messageId})`, transactionError)
                    return {
                        awarded: false,
                        pointsEarned: 0,
                        reason: 'Transaction timeout - please try again',
                    }
                }

                // Handle serialization failures (P2010 - concurrent update, P2034 - deadlock) - retry
                if (transactionError instanceof Prisma.PrismaClientKnownRequestError &&
                    (transactionError.code === 'P2010' || transactionError.code === 'P2034')) {
                    const errorType = transactionError.code === 'P2010' ? 'concurrent update' : 'deadlock'
                    logDebug(`[awardPoint] Serialization failure (${errorType}): userId=${userId}, messageId=${messageId}, attempt=${attempt + 1}/${maxRetries}, duration=${attemptDuration}ms`)
                    if (attempt < maxRetries - 1) {
                        const delay = Math.min(100 * Math.pow(2, attempt), 1000)
                        logDebug(`[awardPoint] Retrying after ${delay}ms delay...`)
                        await new Promise(resolve => setTimeout(resolve, delay))
                        continue // Retry
                    }
                    console.error(`Error awarding point: Serialization failure (${errorType}) after ${maxRetries} attempts (userId=${userId}, messageId=${messageId})`, transactionError)
                    return {
                        awarded: false,
                        pointsEarned: 0,
                        reason: 'Transaction conflict - please try again',
                    }
                }

                // Log other transaction errors with context
                logDebug(`[awardPoint] Transaction error: userId=${userId}, messageId=${messageId}, attempt=${attempt + 1}, duration=${attemptDuration}ms, error=${transactionError instanceof Error ? transactionError.message : 'Unknown'}`)

                // For other errors, throw immediately
                throw transactionError
            }
        }

        // If transaction didn't succeed and we didn't return early, something went wrong
        if (!transactionSucceeded) {
            return {
                awarded: false,
                pointsEarned: 0,
                reason: 'Transaction failed after retries',
            }
        }

        // Log successful point award - this is the main log we want to see
        const subscriberText = isSub ? ' (subscriber)' : ''
        console.log(`✅ +${pointsToAward} point${pointsToAward > 1 ? 's' : ''} → ${user.username}${subscriberText}`)

        return {
            awarded: true,
            pointsEarned: pointsToAward
        }
    } catch (error) {
        console.error('Error awarding point:', error)
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
        const user = await db.user.findUnique({
            where: { kick_user_id: kickUserId },
            select: { id: true },
        })

        if (!user) {
            return { counted: 0 }
        }

        const userId = user.id

        // Get or create user points record (use upsert to handle race conditions)
        let userPoints
        try {
            userPoints = await db.userPoints.upsert({
                where: { user_id: userId },
                update: {},
                create: {
                    user_id: userId,
                    total_points: 0,
                    total_emotes: 0,
                },
            })
        } catch (error) {
            // Handle race condition where multiple requests try to create the same record
            if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
                // Record already exists, fetch it
                userPoints = await db.userPoints.findUnique({
                    where: { user_id: userId },
                })
                if (!userPoints) {
                    // Shouldn't happen, but handle gracefully
                    return { counted: 0 }
                }
            } else {
                // Re-throw other errors
                throw error
            }
        }

        // Update emote count
        await db.userPoints.update({
            where: { user_id: userId },
            data: {
                total_emotes: {
                    increment: totalEmotes,
                },
                updated_at: new Date(),
            },
        })

        logDebug(`✅ Awarded ${totalEmotes} emote(s) to user ${kickUserId} (total_emotes incremented)`)

        return { counted: totalEmotes }
    } catch (error) {
        console.error('Error awarding emotes:', error)
        return { counted: 0 }
    }
}

export async function getUserPoints(kickUserId: bigint): Promise<number> {
    try {
        const user = await db.user.findUnique({
            where: { kick_user_id: kickUserId },
            select: { id: true },
        })

        if (!user) {
            return 0
        }

        const userPoints = await db.userPoints.findUnique({
            where: { user_id: user.id },
        })
        return userPoints?.total_points || 0
    } catch (error) {
        console.error('Error getting user points:', error)
        return 0
    }
}
