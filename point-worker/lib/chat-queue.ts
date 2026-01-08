import { db } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { logErrorRateLimited } from '@/lib/rate-limited-logger'

const verboseQueueLogging = process.env.CHAT_QUEUE_VERBOSE_LOGS === 'true'

const logDebug = (...args: Parameters<typeof console.debug>) => {
    if (verboseQueueLogging) {
        console.debug(...args)
    }
}

// Full message payload stored in the job
export interface ChatJobPayload {
    message_id: string
    content: string
    timestamp: number
    sender: {
        kick_user_id: number
        username: string
        profile_picture?: string | null
        color?: string | null
        badges?: Array<{ text: string; type: string; count?: number }> | null
        is_verified?: boolean
        is_anonymous?: boolean
    }
    broadcaster: {
        kick_user_id: number
        username: string
        profile_picture?: string | null
    }
    emotes?: Array<{ emote_id: string; positions: Array<{ s: number; e: number }> }> | null
    stream_session_id?: bigint | null
    is_stream_active?: boolean
    sweet_coins_earned?: number // Added for real-time coin visibility
    sweet_coins_reason?: string // Reason for coin award or why it wasn't awarded
}

/**
 * Enqueue a chat job for the worker to process
 * This is the ONLY write the main app does - everything else is handled by the worker
 */
export async function enqueueChatJob(payload: ChatJobPayload): Promise<{ success: boolean; error?: string }> {
    const maxRetries = 3

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            await (db as any).chatJob.upsert({
                where: { message_id: payload.message_id },
                update: {
                    // If job exists, update it (idempotent)
                    payload: payload as any,
                    sender_user_id: BigInt(payload.sender.kick_user_id),
                    broadcaster_user_id: BigInt(payload.broadcaster.kick_user_id),
                    stream_session_id: payload.stream_session_id ?? null,
                    status: 'pending',
                    updated_at: new Date(),
                },
                create: {
                    message_id: payload.message_id,
                    payload: payload as any,
                    sender_user_id: BigInt(payload.sender.kick_user_id),
                    broadcaster_user_id: BigInt(payload.broadcaster.kick_user_id),
                    stream_session_id: payload.stream_session_id ?? null,
                    status: 'pending',
                },
            })
            logDebug(`[enqueueChatJob] Enqueued job for messageId=${payload.message_id}`)
            return { success: true }
        } catch (error: any) {
            // Check if it's a table missing error (P2021)
            if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2021') {
                console.error(`[enqueueChatJob] Table 'chat_jobs' does not exist. Run migration.`)
                return { success: false, error: 'Table missing' }
            }

            // Check if it's a connection error (P1001 - Can't reach database server)
            const isConnectionError = error?.code === 'P1001' ||
                                    error?.message?.includes("Can't reach database server") ||
                                    error?.message?.includes('PrismaClientInitializationError')

            // Handle connection pool exhaustion with retry
            const isRetryableError = error?.code === 'P2024' ||
                                    error?.code === 'P2028' ||
                                    error?.message?.includes('connection pool') ||
                                    error?.message?.includes('Unable to start a transaction')

            if (isRetryableError && attempt < maxRetries - 1) {
                const delay = Math.min(100 * Math.pow(2, attempt), 1000)
                await new Promise(resolve => setTimeout(resolve, delay))
                continue
            }

            // Use rate-limited logging for connection errors to prevent spam
            if (isConnectionError) {
                logErrorRateLimited(`[enqueueChatJob] Database connection error (messageId=${payload.message_id})`, error)
            } else {
                logErrorRateLimited(`[enqueueChatJob] Failed to enqueue job for messageId=${payload.message_id}`, error)
            }
            return { success: false, error: error?.message || 'Unknown error' }
        }
    }
    return { success: false, error: 'Max retries exceeded' }
}

export interface ClaimedChatJob {
    id: bigint
    message_id: string
    payload: ChatJobPayload
    sender_user_id: bigint
    broadcaster_user_id: bigint
    stream_session_id: bigint | null
    attempts: number
}

/**
 * Atomically claim a batch of pending chat jobs using FOR UPDATE SKIP LOCKED
 */
export async function claimChatJobs(batchSize: number = 10, lockTimeoutSeconds: number = 300): Promise<ClaimedChatJob[]> {
    const lockExpiry = new Date(Date.now() - lockTimeoutSeconds * 1000)
    const maxRetries = 3

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            const jobs = await (db as any).$transaction(async (tx: any) => {
                // Unlock stale locks
                await tx.$executeRaw`
                    UPDATE platform_chat_jobs
                    SET status = 'pending', locked_at = NULL
                    WHERE status = 'processing'
                    AND locked_at < ${lockExpiry}
                `

                // Claim jobs atomically
                const claimedJobs = await tx.$queryRaw<ClaimedChatJob[]>`
                    WITH cte AS (
                        SELECT id
                        FROM platform_chat_jobs
                        WHERE status = 'pending'
                        ORDER BY created_at ASC
                        LIMIT ${batchSize}
                        FOR UPDATE SKIP LOCKED
                    )
                    UPDATE platform_chat_jobs AS p
                    SET status = 'processing', locked_at = NOW(), attempts = attempts + 1
                    WHERE p.id IN (SELECT id FROM cte)
                    RETURNING p.id, p.message_id, p.payload, p.sender_user_id, p.broadcaster_user_id, p.stream_session_id, p.attempts
                `

                return claimedJobs || []
            }, {
                maxWait: 10000,
                timeout: 15000,
            })

            if (jobs.length === 0) {
                return []
            }

            logDebug(`[claimChatJobs] Claimed ${jobs.length} jobs`)
            return jobs
        } catch (error: any) {
            const isRetryableError = error?.code === 'P2024' ||
                                    error?.code === 'P2028' ||
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
                logErrorRateLimited('[claimChatJobs] Database connection error', error)
            } else {
                logErrorRateLimited('[claimChatJobs] Failed to claim jobs', error)
            }
            return []
        }
    }
    return []
}

/**
 * Mark a job as completed
 */
export async function completeChatJob(jobId: bigint): Promise<void> {
    try {
        await (db as any).chatJob.update({
            where: { id: jobId },
            data: {
                status: 'completed',
                processed_at: new Date(),
                locked_at: null,
            },
        })
    } catch (error: any) {
        const isConnectionError = error?.code === 'P1001' ||
                                error?.message?.includes("Can't reach database server") ||
                                error?.message?.includes('PrismaClientInitializationError')
        if (isConnectionError) {
            logErrorRateLimited(`[completeChatJob] Database connection error (jobId=${jobId})`, error)
        } else {
            logErrorRateLimited(`[completeChatJob] Failed to mark job ${jobId} as completed`, error)
        }
    }
}

/**
 * Mark a job as failed or reset for retry
 */
export async function failChatJob(jobId: bigint, error: string, attempts: number, maxAttempts: number = 5): Promise<void> {
    const shouldRetry = attempts < maxAttempts
    try {
        await (db as any).chatJob.update({
            where: { id: jobId },
            data: {
                status: shouldRetry ? 'pending' : 'failed',
                locked_at: null,
                last_error: error.substring(0, 1000),
                processed_at: shouldRetry ? null : new Date(),
            },
        })
    } catch (updateError: any) {
        const isConnectionError = updateError?.code === 'P1001' ||
                                updateError?.message?.includes("Can't reach database server") ||
                                updateError?.message?.includes('PrismaClientInitializationError')
        if (isConnectionError) {
            logErrorRateLimited(`[failChatJob] Database connection error`, updateError)
        } else {
            logErrorRateLimited(`[failChatJob] Failed to update job status`, updateError)
        }
    }
}

/**
 * Get queue statistics for monitoring
 */
export async function getChatQueueStats(): Promise<{
    pending: number
    processing: number
    completed: number
    failed: number
    staleLocks: number
}> {
    try {
        const [pending, processing, completed, failed, staleLocks] = await Promise.all([
            (db as any).chatJob.count({ where: { status: 'pending' } }),
            (db as any).chatJob.count({ where: { status: 'processing' } }),
            (db as any).chatJob.count({ where: { status: 'completed' } }),
            (db as any).chatJob.count({ where: { status: 'failed' } }),
            (db as any).$queryRaw<Array<{ count: bigint }>>`
                SELECT COUNT(*)::bigint as count
                FROM platform_chat_jobs
                WHERE status = 'processing'
                AND locked_at < NOW() - INTERVAL '5 minutes'
            `,
        ])

        return {
            pending,
            processing,
            completed,
            failed,
            staleLocks: Number(staleLocks[0]?.count || 0),
        }
    } catch (error: any) {
        const isConnectionError = error?.code === 'P1001' ||
                                error?.message?.includes("Can't reach database server") ||
                                error?.message?.includes('PrismaClientInitializationError')
        if (isConnectionError) {
            logErrorRateLimited('[getChatQueueStats] Database connection error', error)
        } else {
            logErrorRateLimited('[getChatQueueStats] Failed to get queue stats', error)
        }
        return { pending: 0, processing: 0, completed: 0, failed: 0, staleLocks: 0 }
    }
}
