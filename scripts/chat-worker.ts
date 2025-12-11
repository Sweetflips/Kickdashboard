#!/usr/bin/env node
/**
 * CHAT WORKER - Handles ALL database writes
 *
 * This worker processes chat jobs and performs:
 * 1. User upserts (sender + broadcaster)
 * 2. Message saves
 * 3. Point awards
 * 4. Emote counting
 *
 * The main Kickdashboard app only READS from the database.
 * All writes go through this worker via the chat_jobs queue.
 */

console.log('')
console.log('========================================')
console.log('🔄 CHAT WORKER STARTING')
console.log('========================================')
console.log('')

import { db } from '../lib/db'
import { claimChatJobs, completeChatJob, failChatJob, getChatQueueStats, type ClaimedChatJob, type ChatJobPayload } from '../lib/chat-queue'
import { awardPoint, awardEmotes, isBot } from '../lib/points'
import { detectBotMessage } from '../lib/bot-detection'
import { queueUserEnrichment } from '../lib/user-enrichment'

const BATCH_SIZE = parseInt(process.env.CHAT_WORKER_BATCH_SIZE || '50', 10)
const POLL_INTERVAL_MS = parseInt(process.env.CHAT_WORKER_POLL_INTERVAL_MS || '500', 10)
const CONCURRENCY = parseInt(process.env.CHAT_WORKER_CONCURRENCY || '10', 10)
const STATS_INTERVAL_MS = parseInt(process.env.CHAT_WORKER_STATS_INTERVAL_MS || '60000', 10)

// Advisory lock ID to ensure only one worker instance runs
const ADVISORY_LOCK_ID = BigInt('9223372036854775805') // Different from point-worker

let isShuttingDown = false
let activeWorkers = 0
let advisoryLockAcquired = false

// Stats tracking
let processedCount = 0
let errorCount = 0

async function acquireAdvisoryLock(): Promise<boolean> {
    try {
        const result = await db.$queryRaw<Array<{ pg_try_advisory_lock: boolean }>>`
            SELECT pg_try_advisory_lock(${ADVISORY_LOCK_ID}) as pg_try_advisory_lock
        `
        const acquired = result[0]?.pg_try_advisory_lock ?? false
        if (acquired) {
            advisoryLockAcquired = true
            console.log(`[chat-worker] ✅ Advisory lock acquired`)
        } else {
            console.error(`[chat-worker] ❌ Failed to acquire advisory lock - another worker is running`)
        }
        return acquired
    } catch (error) {
        console.error(`[chat-worker] ❌ Error acquiring advisory lock:`, error)
        return false
    }
}

async function releaseAdvisoryLock(): Promise<void> {
    if (!advisoryLockAcquired) return
    try {
        await db.$queryRaw`SELECT pg_advisory_unlock(${ADVISORY_LOCK_ID})`
        console.log(`[chat-worker] ✅ Advisory lock released`)
    } catch (error) {
        console.error(`[chat-worker] ⚠️ Error releasing advisory lock:`, error)
    }
}

const shutdown = async (signal: string) => {
    if (isShuttingDown) {
        console.log(`[chat-worker] ${signal} received again, forcing exit`)
        await releaseAdvisoryLock()
        process.exit(1)
    }

    console.log(`[chat-worker] ${signal} received, shutting down gracefully...`)
    isShuttingDown = true

    const maxWaitTime = 30000
    const startWait = Date.now()

    while (activeWorkers > 0 && Date.now() - startWait < maxWaitTime) {
        console.log(`[chat-worker] Waiting for ${activeWorkers} active workers to finish...`)
        await new Promise(resolve => setTimeout(resolve, 1000))
    }

    if (activeWorkers > 0) {
        console.log(`[chat-worker] Timeout waiting for workers, forcing exit`)
    }

    await releaseAdvisoryLock()
    console.log(`[chat-worker] Shutdown complete (processed: ${processedCount}, errors: ${errorCount})`)
    process.exit(0)
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))

/**
 * Process a single chat job - handles ALL writes
 */
async function processChatJob(job: ClaimedChatJob): Promise<void> {
    const startTime = Date.now()
    const payload = job.payload as ChatJobPayload

    try {
        const senderUserId = BigInt(payload.sender.kick_user_id)
        const broadcasterUserId = BigInt(payload.broadcaster.kick_user_id)
        const senderUsernameLower = payload.sender.username.toLowerCase()

        // ═══════════════════════════════════════════════════════════════
        // STEP 1: UPSERT USERS (parallel for efficiency)
        // ═══════════════════════════════════════════════════════════════

        const [senderResult, broadcasterResult] = await Promise.all([
            db.user.upsert({
                where: { kick_user_id: senderUserId },
                update: {
                    username: payload.sender.username,
                    profile_picture_url: payload.sender.profile_picture || undefined,
                },
                create: {
                    kick_user_id: senderUserId,
                    username: payload.sender.username,
                    profile_picture_url: payload.sender.profile_picture || null,
                },
                select: { id: true, email: true, profile_picture_url: true, bio: true },
            }),
            db.user.upsert({
                where: { kick_user_id: broadcasterUserId },
                update: {
                    username: payload.broadcaster.username,
                    profile_picture_url: payload.broadcaster.profile_picture || undefined,
                },
                create: {
                    kick_user_id: broadcasterUserId,
                    username: payload.broadcaster.username,
                    profile_picture_url: payload.broadcaster.profile_picture || null,
                },
                select: { id: true, email: true, profile_picture_url: true, bio: true },
            }),
        ])

        // Queue user enrichment if needed (non-blocking)
        if (!senderResult.email || !senderResult.profile_picture_url || !senderResult.bio) {
            queueUserEnrichment(senderUserId, payload.sender.username)
        }
        if (!broadcasterResult.email || !broadcasterResult.profile_picture_url || !broadcasterResult.bio) {
            queueUserEnrichment(broadcasterUserId, payload.broadcaster.username)
        }

        // ═══════════════════════════════════════════════════════════════
        // STEP 2: DETERMINE IF STREAM IS OFFLINE
        // ═══════════════════════════════════════════════════════════════

        const sentWhenOffline = !payload.is_stream_active || !payload.stream_session_id

        // ═══════════════════════════════════════════════════════════════
        // STEP 3: SAVE MESSAGE
        // ═══════════════════════════════════════════════════════════════

        let pointsEarned = 0
        let pointsReason: string | null = null

        if (sentWhenOffline) {
            // Save to offline messages table
            await db.offlineChatMessage.upsert({
                where: { message_id: payload.message_id },
                update: {
                    sender_username: payload.sender.username,
                    content: payload.content,
                    emotes: payload.emotes || undefined,
                    timestamp: BigInt(payload.timestamp),
                    sender_username_color: payload.sender.color || null,
                    sender_badges: payload.sender.badges || undefined,
                    sender_is_verified: payload.sender.is_verified || false,
                    sender_is_anonymous: payload.sender.is_anonymous || false,
                },
                create: {
                    message_id: payload.message_id,
                    sender_user_id: senderUserId,
                    sender_username: payload.sender.username,
                    broadcaster_user_id: broadcasterUserId,
                    content: payload.content,
                    emotes: payload.emotes || undefined,
                    timestamp: BigInt(payload.timestamp),
                    sender_username_color: payload.sender.color || null,
                    sender_badges: payload.sender.badges || undefined,
                    sender_is_verified: payload.sender.is_verified || false,
                    sender_is_anonymous: payload.sender.is_anonymous || false,
                },
            })
        } else {
            // Save to chat messages table (with session)
            await db.chatMessage.upsert({
                where: { message_id: payload.message_id },
                update: {
                    stream_session_id: payload.stream_session_id,
                    sender_username: payload.sender.username,
                    content: payload.content,
                    emotes: payload.emotes || undefined,
                    timestamp: BigInt(payload.timestamp),
                    sender_username_color: payload.sender.color || null,
                    sender_badges: payload.sender.badges || undefined,
                    sender_is_verified: payload.sender.is_verified || false,
                    sender_is_anonymous: payload.sender.is_anonymous || false,
                    sent_when_offline: false,
                },
                create: {
                    message_id: payload.message_id,
                    stream_session_id: payload.stream_session_id,
                    sender_user_id: senderUserId,
                    sender_username: payload.sender.username,
                    broadcaster_user_id: broadcasterUserId,
                    content: payload.content,
                    emotes: payload.emotes || undefined,
                    timestamp: BigInt(payload.timestamp),
                    sender_username_color: payload.sender.color || null,
                    sender_badges: payload.sender.badges || undefined,
                    sender_is_verified: payload.sender.is_verified || false,
                    sender_is_anonymous: payload.sender.is_anonymous || false,
                    points_earned: 0,
                    sent_when_offline: false,
                },
            })

            // ═══════════════════════════════════════════════════════════════
            // STEP 4: AWARD POINTS (only for live stream messages)
            // ═══════════════════════════════════════════════════════════════

            if (!isBot(senderUsernameLower)) {
                // Bot detection
                const botDetection = detectBotMessage(payload.content, [])

                if (botDetection.isBot) {
                    pointsReason = 'Bot detected'
                } else if (payload.stream_session_id) {
                    // Award points
                    const pointResult = await awardPoint(
                        senderUserId,
                        payload.stream_session_id,
                        payload.message_id,
                        payload.sender.badges
                    )

                    pointsEarned = pointResult.pointsEarned || 0
                    pointsReason = pointResult.reason || null

                    // Award emotes
                    if (payload.emotes && Array.isArray(payload.emotes) && payload.emotes.length > 0) {
                        await awardEmotes(senderUserId, payload.emotes).catch(() => {})
                    }
                }

                // Update message with points info
                if (pointsEarned > 0 || pointsReason) {
                    await db.chatMessage.updateMany({
                        where: { message_id: payload.message_id },
                        data: {
                            points_earned: pointsEarned,
                            points_reason: pointsReason,
                        },
                    }).catch(() => {})
                }
            }
        }

        // ═══════════════════════════════════════════════════════════════
        // STEP 5: MARK JOB COMPLETE
        // ═══════════════════════════════════════════════════════════════

        await completeChatJob(job.id)
        processedCount++

        const duration = Date.now() - startTime
        if (pointsEarned > 0) {
            const isSub = payload.sender.badges?.some(b =>
                b.type?.toLowerCase().includes('subscriber') ||
                b.type?.toLowerCase().includes('sub') ||
                b.text?.toLowerCase().includes('sub')
            )
            console.log(`✅ +${pointsEarned} pt → ${payload.sender.username}${isSub ? ' (sub)' : ''} [${duration}ms]`)
        }

    } catch (error) {
        errorCount++
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        console.error(`[chat-worker] Error processing job ${job.id}:`, errorMessage)
        await failChatJob(job.id, errorMessage, job.attempts)
    }
}

/**
 * Process a batch of jobs with concurrency control
 */
async function processBatch(): Promise<void> {
    if (isShuttingDown) return

    if (activeWorkers >= CONCURRENCY) return

    const availableSlots = CONCURRENCY - activeWorkers
    const batchSize = Math.min(BATCH_SIZE, availableSlots)

    const jobs = await claimChatJobs(batchSize)

    if (jobs.length === 0) return

    const processingPromises = jobs.map(async (job) => {
        activeWorkers++
        try {
            await processChatJob(job)
        } finally {
            activeWorkers--
        }
    })

    await Promise.all(processingPromises)
}

/**
 * Main worker loop
 */
async function runWorker(): Promise<void> {
    console.log(`[chat-worker] Starting chat worker`)
    console.log(`[chat-worker] Configuration: batchSize=${BATCH_SIZE}, pollInterval=${POLL_INTERVAL_MS}ms, concurrency=${CONCURRENCY}`)

    const lockAcquired = await acquireAdvisoryLock()
    if (!lockAcquired) {
        console.error(`[chat-worker] Exiting - another worker is running`)
        process.exit(1)
    }

    let lastStatsLog = Date.now()

    while (!isShuttingDown) {
        try {
            await processBatch()

            // Log stats periodically
            const now = Date.now()
            if (now - lastStatsLog >= STATS_INTERVAL_MS) {
                const stats = await getChatQueueStats()
                console.log(`[chat-worker] Queue: pending=${stats.pending}, processing=${stats.processing}, completed=${stats.completed}, failed=${stats.failed} | Session: processed=${processedCount}, errors=${errorCount}`)
                lastStatsLog = now
            }

            await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS))
        } catch (error) {
            console.error(`[chat-worker] Error in worker loop:`, error)
            await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS * 2))
        }
    }
}

// Start the worker
runWorker().catch(async (error) => {
    console.error(`[chat-worker] Fatal error:`, error)
    await releaseAdvisoryLock()
    process.exit(1)
})
