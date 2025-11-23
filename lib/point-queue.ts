import { db } from '@/lib/db'
import { awardPoint, awardEmotes } from '@/lib/points'
import { Prisma } from '@prisma/client'

const verboseQueueLogging = process.env.POINT_QUEUE_VERBOSE_LOGS === 'true'

const logDebug = (...args: Parameters<typeof console.debug>) => {
    if (verboseQueueLogging) {
        console.debug(...args)
    }
}

export type PointAwardJobStatus = 'pending' | 'processing' | 'completed' | 'failed'

export interface EnqueuePointJobParams {
    kickUserId: bigint
    streamSessionId: bigint | null
    messageId: string
    badges?: Array<{ text: string; type: string; count?: number }> | null
    emotes?: Array<{ emote_id: string; positions: Array<{ s: number; e: number }> }> | null
}

/**
 * Enqueue a point award job for async processing
 */
export async function enqueuePointJob(params: EnqueuePointJobParams): Promise<void> {
    try {
        await db.pointAwardJob.upsert({
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
        logDebug(`[enqueuePointJob] Enqueued job for messageId=${params.messageId}`)
    } catch (error) {
        // Log but don't throw - queue failures shouldn't break message saving
        console.error(`[enqueuePointJob] Failed to enqueue job for messageId=${params.messageId}:`, error)
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
 */
export async function claimJobs(batchSize: number = 10, lockTimeoutSeconds: number = 300): Promise<ClaimedJob[]> {
    const lockExpiry = new Date(Date.now() - lockTimeoutSeconds * 1000)

    try {
        // First, unlock any stale locks (jobs locked too long ago)
        await db.$executeRaw`
            UPDATE point_award_jobs
            SET status = 'pending', locked_at = NULL
            WHERE status = 'processing'
            AND locked_at < ${lockExpiry}
        `

        // Claim pending jobs atomically
        const jobs = await db.$queryRaw<ClaimedJob[]>`
            SELECT id, kick_user_id, stream_session_id, message_id, badges, emotes, attempts
            FROM point_award_jobs
            WHERE status = 'pending'
            ORDER BY created_at ASC
            LIMIT ${batchSize}
            FOR UPDATE SKIP LOCKED
        `

        if (jobs.length === 0) {
            return []
        }

        // Mark jobs as processing and set lock timestamp
        const jobIds = jobs.map(j => j.id)
        const now = new Date()

        await db.$executeRaw`
            UPDATE point_award_jobs
            SET status = 'processing', locked_at = ${now}, attempts = attempts + 1
            WHERE id = ANY(${jobIds}::bigint[])
        `

        logDebug(`[claimJobs] Claimed ${jobs.length} jobs`)
        return jobs
    } catch (error) {
        console.error('[claimJobs] Failed to claim jobs:', error)
        return []
    }
}

/**
 * Process a single job: award points and emotes, then update job status
 */
export async function processJob(job: ClaimedJob): Promise<{ success: boolean; pointsEarned: number; reason?: string }> {
    const startTime = Date.now()

    try {
        // Award points
        const pointResult = await awardPoint(
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

        // Update message with points/reason
        if (pointResult.awarded || pointResult.pointsEarned !== undefined) {
            await db.chatMessage.updateMany({
                where: {
                    message_id: job.message_id,
                    points_earned: 0, // Only update if still 0
                },
                data: {
                    points_earned: pointResult.pointsEarned || 0,
                    points_reason: pointResult.pointsEarned && pointResult.pointsEarned > 0 ? null : (pointResult.reason || null),
                },
            })
        }

        // Mark job as completed
        await db.pointAwardJob.update({
            where: { id: job.id },
            data: {
                status: 'completed',
                processed_at: new Date(),
                locked_at: null,
            },
        })

        const duration = Date.now() - startTime
        logDebug(`[processJob] Completed job id=${job.id}, messageId=${job.message_id}, points=${pointResult.pointsEarned || 0}, duration=${duration}ms`)

        return {
            success: true,
            pointsEarned: pointResult.pointsEarned || 0,
            reason: pointResult.reason,
        }
    } catch (error) {
        const duration = Date.now() - startTime
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        const maxAttempts = 5

        // Mark as failed if max attempts reached, otherwise reset to pending for retry
        const shouldRetry = job.attempts < maxAttempts

        await db.pointAwardJob.update({
            where: { id: job.id },
            data: {
                status: shouldRetry ? 'pending' : 'failed',
                locked_at: null,
                last_error: errorMessage.substring(0, 1000), // Limit error length
                processed_at: shouldRetry ? null : new Date(),
            },
        })

        if (shouldRetry) {
            logDebug(`[processJob] Job id=${job.id}, messageId=${job.message_id} failed (attempt ${job.attempts}/${maxAttempts}), will retry. Error: ${errorMessage}, duration=${duration}ms`)
        } else {
            console.error(`[processJob] Job id=${job.id}, messageId=${job.message_id} failed after ${maxAttempts} attempts. Error: ${errorMessage}, duration=${duration}ms`)
        }

        return {
            success: false,
            pointsEarned: 0,
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
            db.pointAwardJob.count({ where: { status: 'pending' } }),
            db.pointAwardJob.count({ where: { status: 'processing' } }),
            db.pointAwardJob.count({ where: { status: 'completed' } }),
            db.pointAwardJob.count({ where: { status: 'failed' } }),
            db.$queryRaw<Array<{ count: bigint }>>`
                SELECT COUNT(*)::bigint as count
                FROM point_award_jobs
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
    } catch (error) {
        console.error('[getQueueStats] Failed to get queue stats:', error)
        return {
            pending: 0,
            processing: 0,
            completed: 0,
            failed: 0,
            staleLocks: 0,
        }
    }
}
