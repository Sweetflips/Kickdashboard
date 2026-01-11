import { db } from '@/lib/db'
import { awardSweetCoins, awardEmotes } from '@/lib/sweet-coins'
import { Prisma } from '@prisma/client'
import { logErrorRateLimited } from '@/lib/rate-limited-logger'

const verboseQueueLogging = process.env.POINT_QUEUE_VERBOSE_LOGS === 'true'

const logDebug = (...args: Parameters<typeof console.debug>) => {
    if (verboseQueueLogging) {
        console.debug(...args)
    }
}

export type SweetCoinAwardJobStatus = 'pending' | 'processing' | 'completed' | 'failed'

export interface EnqueueSweetCoinJobParams {
    kickUserId: bigint
    streamSessionId: bigint | null
    messageId: string
    badges?: Array<{ text: string; type: string; count?: number }> | null
    emotes?: Array<{ emote_id: string; positions: Array<{ s: number; e: number }> }> | null
}

/**
 * Enqueue a sweet coin award job for async processing
 */
export async function enqueueSweetCoinJob(params: EnqueueSweetCoinJobParams): Promise<void> {
    const maxRetries = 3

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            await db.sweetCoinAwardJob.upsert({
                where: { message_id: params.messageId },
                update: {
                    // Update if job already exists (idempotent)
                    kick_user_id: params.kickUserId,
                    stream_session_id: params.streamSessionId,
                    badges: params.badges as any,
                    emotes: params.emotes as any,
                    status: 'pending',
                    updated_at: new Date(),
                },
                create: {
                    kick_user_id: params.kickUserId,
                    stream_session_id: params.streamSessionId,
                    message_id: params.messageId,
                    badges: params.badges as any,
                    emotes: params.emotes as any,
                    status: 'pending',
                },
            })
            logDebug(`[enqueueSweetCoinJob] Enqueued job for messageId=${params.messageId}`)
            return // Success
        } catch (error: any) {
            // Check if it's a table missing error (P2021)
            if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2021') {
                // Table doesn't exist - log a clear error message
                console.error(`[enqueueSweetCoinJob] Table 'sweet_coin_award_jobs' does not exist. Run migration: npx prisma migrate deploy`)
                return // Don't retry for missing table
            }

            // Handle connection pool exhaustion (P2024), serialization (P4001), deadlocks (P2034) with retry
            const isRetryableError = error?.code === 'P2024' ||
                                    error?.code === 'P4001' ||
                                    error?.code === 'P2034' ||
                                    error?.message?.includes('could not serialize access') ||
                                    error?.message?.includes('concurrent update') ||
                                    error?.message?.includes('connection pool')

            if (isRetryableError && attempt < maxRetries - 1) {
                const delay = Math.min(100 * Math.pow(2, attempt), 1000) // 100ms, 200ms, 400ms max
                await new Promise(resolve => setTimeout(resolve, delay))
                continue // Retry
            }

            // Log but don't throw - queue failures shouldn't break message saving
            const isConnectionError = error?.code === 'P1001' ||
                                    error?.message?.includes("Can't reach database server") ||
                                    error?.message?.includes('PrismaClientInitializationError')
            if (isConnectionError) {
                logErrorRateLimited(`[enqueueSweetCoinJob] Database connection error (messageId=${params.messageId})`, error)
            } else {
                logErrorRateLimited(`[enqueueSweetCoinJob] Failed to enqueue job for messageId=${params.messageId}`, error)
            }
            return // Give up after retries
        }
    }
}

export interface ClaimedJob {
    id: bigint
    kick_user_id: bigint
    stream_session_id: bigint | null
    message_id: string
    badges: any
    emotes: any
    attempts: number
}

/**
 * Atomically claim a batch of pending jobs using FOR UPDATE SKIP LOCKED
 * This prevents multiple workers from processing the same job
 * Uses a single atomic transaction with CTE to eliminate race conditions
 */
export async function claimJobs(batchSize: number = 10, lockTimeoutSeconds: number = 300): Promise<ClaimedJob[]> {
    const lockExpiry = new Date(Date.now() - lockTimeoutSeconds * 1000)
    const maxRetries = 3

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            // Use a single transaction to atomically unlock stale locks and claim new jobs
            const jobs = await db.$transaction(async (tx: Prisma.TransactionClient) => {
                // First, unlock any stale locks (jobs locked too long ago)
                await tx.$executeRaw`
                    UPDATE sweet_coin_award_jobs
                    SET status = 'pending', locked_at = NULL
                    WHERE status = 'processing'
                    AND locked_at < ${lockExpiry}
                `

                // Atomically claim and update jobs in a single query using CTE
                const claimedJobs = await tx.$queryRaw<ClaimedJob[]>`
                    WITH cte AS (
                        SELECT id
                        FROM sweet_coin_award_jobs
                        WHERE status = 'pending'
                        ORDER BY created_at ASC
                        LIMIT ${batchSize}
                        FOR UPDATE SKIP LOCKED
                    )
                    UPDATE sweet_coin_award_jobs AS p
                    SET status = 'processing', locked_at = NOW(), attempts = attempts + 1
                    WHERE p.id IN (SELECT id FROM cte)
                    RETURNING p.id, p.kick_user_id, p.stream_session_id, p.message_id, p.badges, p.emotes, p.attempts
                `

                return claimedJobs || []
            }, {
                maxWait: 10000,
                timeout: 15000,
            })

            if (jobs.length === 0) {
                return []
            }

            logDebug(`[claimJobs] Claimed ${jobs.length} jobs`)
            return jobs
        } catch (error: any) {
            // Handle connection pool exhaustion with retry
            const isRetryableError = error?.code === 'P2024' ||
                                    error?.message?.includes('connection pool')

            if (isRetryableError && attempt < maxRetries - 1) {
                const delay = Math.min(100 * Math.pow(2, attempt), 1000)
                await new Promise(resolve => setTimeout(resolve, delay))
                continue
            }

            const isConnectionError = error?.code === 'P1001' ||
                                    error?.message?.includes("Can't reach database server") ||
                                    error?.message?.includes('PrismaClientInitializationError')
            if (isConnectionError) {
                logErrorRateLimited('[claimJobs] Database connection error', error)
            } else {
                logErrorRateLimited('[claimJobs] Failed to claim jobs', error)
            }
            return []
        }
    }
    return []
}

/**
 * Helper for DB updates with retry logic for connection pool exhaustion
 */
async function dbUpdateWithRetry<T>(operation: () => Promise<T>, maxRetries = 3): Promise<T> {
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

/**
 * Process a single job: award sweet coins and emotes, then update job status
 */
export async function processJob(job: ClaimedJob): Promise<{ success: boolean; sweetCoinsEarned: number; reason?: string }> {
    const startTime = Date.now()

    try {
        // Award sweet coins
        const sweetCoinResult = await awardSweetCoins(
            job.kick_user_id,
            job.stream_session_id,
            job.message_id,
            job.badges as any
        )

        // Award emotes if present
        if (job.emotes && Array.isArray(job.emotes) && job.emotes.length > 0) {
            try {
                await awardEmotes(job.kick_user_id, job.emotes as any)
            } catch (emoteError) {
                // Log but don't fail the job - emotes are non-critical
                console.warn(`[processJob] Failed to award emotes for messageId=${job.message_id}:`, emoteError)
            }
        }

        // Update message with sweet coins/reason (with retry for connection pool)
        if (sweetCoinResult.awarded || sweetCoinResult.sweetCoinsEarned !== undefined) {
            await dbUpdateWithRetry(() => db.chatMessage.updateMany({
                where: {
                    message_id: job.message_id,
                    sweet_coins_earned: 0, // Only update if still 0
                },
                data: {
                    sweet_coins_earned: sweetCoinResult.sweetCoinsEarned || 0,
                    sweet_coins_reason: sweetCoinResult.sweetCoinsEarned && sweetCoinResult.sweetCoinsEarned > 0 ? null : (sweetCoinResult.reason || null),
                },
            }))
        }

        // Mark job as completed (with retry for connection pool)
        await dbUpdateWithRetry(() => db.sweetCoinAwardJob.update({
            where: { id: job.id },
            data: {
                status: 'completed',
                processed_at: new Date(),
                locked_at: null,
            },
        }))

        const duration = Date.now() - startTime
        logDebug(`[processJob] Completed job id=${job.id}, messageId=${job.message_id}, sweetCoins=${sweetCoinResult.sweetCoinsEarned || 0}, duration=${duration}ms`)

        return {
            success: true,
            sweetCoinsEarned: sweetCoinResult.sweetCoinsEarned || 0,
            reason: sweetCoinResult.reason,
        }
    } catch (error) {
        const duration = Date.now() - startTime
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        const maxAttempts = 5

        // Mark as failed if max attempts reached, otherwise reset to pending for retry
        const shouldRetry = job.attempts < maxAttempts

        // Update job status with retry for connection pool
        await dbUpdateWithRetry(() => db.sweetCoinAwardJob.update({
            where: { id: job.id },
            data: {
                status: shouldRetry ? 'pending' : 'failed',
                locked_at: null,
                last_error: errorMessage.substring(0, 1000), // Limit error length
                processed_at: shouldRetry ? null : new Date(),
            },
        })).catch(updateError => {
            // Log but don't fail - job will be picked up by stale lock recovery
            const isConnectionError = updateError?.code === 'P1001' ||
                                    updateError?.message?.includes("Can't reach database server") ||
                                    updateError?.message?.includes('PrismaClientInitializationError')
            if (isConnectionError) {
                logErrorRateLimited(`[processJob] Database connection error (jobId=${job.id})`, updateError)
            } else {
                logErrorRateLimited(`[processJob] Failed to update job status (jobId=${job.id})`, updateError)
            }
        })

        if (shouldRetry) {
            logDebug(`[processJob] Job id=${job.id}, messageId=${job.message_id} failed (attempt ${job.attempts}/${maxAttempts}), will retry. Error: ${errorMessage}, duration=${duration}ms`)
        } else {
            console.error(`[processJob] Job id=${job.id}, messageId=${job.message_id} failed after ${maxAttempts} attempts. Error: ${errorMessage}, duration=${duration}ms`)
        }

        return {
            success: false,
            sweetCoinsEarned: 0,
            reason: errorMessage,
        }
    }
}

/**
 * Get queue statistics for monitoring
 */
export async function getQueueStats(): Promise<{
    pending: number
    processing: number
    completed: number
    failed: number
    staleLocks: number
}> {
    try {
        const [pending, processing, completed, failed, staleLocks] = await Promise.all([
            db.sweetCoinAwardJob.count({ where: { status: 'pending' } }),
            db.sweetCoinAwardJob.count({ where: { status: 'processing' } }),
            db.sweetCoinAwardJob.count({ where: { status: 'completed' } }),
            db.sweetCoinAwardJob.count({ where: { status: 'failed' } }),
            db.$queryRaw<Array<{ count: bigint }>>`
                SELECT COUNT(*)::bigint as count
                FROM sweet_coin_award_jobs
                WHERE status = 'processing'
                AND locked_at < NOW() - INTERVAL '5 minutes'
            `,
        ])

        return {
            pending: pending,
            processing: processing,
            completed: completed,
            failed: failed,
            staleLocks: Number(staleLocks[0]?.count || 0),
        }
    } catch (error: any) {
        const isConnectionError = error?.code === 'P1001' ||
                                error?.message?.includes("Can't reach database server") ||
                                error?.message?.includes('PrismaClientInitializationError')
        if (isConnectionError) {
            logErrorRateLimited('[getQueueStats] Database connection error', error)
        } else {
            logErrorRateLimited('[getQueueStats] Failed to get queue stats', error)
        }
        return {
            pending: 0,
            processing: 0,
            completed: 0,
            failed: 0,
            staleLocks: 0,
        }
    }
}

// Legacy exports for backward compatibility during migration
export const enqueuePointJob = enqueueSweetCoinJob
export type PointAwardJobStatus = SweetCoinAwardJobStatus
export type EnqueuePointJobParams = EnqueueSweetCoinJobParams
