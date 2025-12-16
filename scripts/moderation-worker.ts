#!/usr/bin/env node
/**
 * MODERATION WORKER - Handles ONLY moderation actions
 *
 * This worker processes chat jobs and performs ONLY moderation checks.
 * It sends chat messages to show it's working and announce moderation actions.
 */

console.log('')
console.log('========================================')
console.log('🛡️ MODERATION WORKER STARTING')
console.log('========================================')
console.log('')

import { db } from '../lib/db'
import { claimChatJobs, completeChatJob, failChatJob, getChatQueueStats, type ClaimedChatJob, type ChatJobPayload } from '../lib/chat-queue'
import { moderationBan, sendModeratorChatMessage, getModeratorToken } from '../lib/kick-api'

const BATCH_SIZE = parseInt(process.env.MODERATION_WORKER_BATCH_SIZE || '50', 10)
const POLL_INTERVAL_MS = parseInt(process.env.MODERATION_WORKER_POLL_INTERVAL_MS || '500', 10)
const CONCURRENCY = parseInt(process.env.MODERATION_WORKER_CONCURRENCY || '10', 10)
const STATS_INTERVAL_MS = parseInt(process.env.MODERATION_WORKER_STATS_INTERVAL_MS || '60000', 10)
const VERBOSE_LOGS = process.env.MODERATION_WORKER_VERBOSE_LOGS === 'true'

// Moderation configuration
const MODERATION_ENABLED = process.env.KICK_MODERATION_ENABLED !== 'false'
const DRY_RUN = process.env.KICK_MODERATION_DRY_RUN === '1'
const MODERATOR_USERNAME = (process.env.KICK_MODERATOR_USERNAME || 'sweetflipsbot').toLowerCase()
const ALLOWLIST = (process.env.KICK_MODERATION_ALLOWLIST || '').split(',').map(u => u.trim().toLowerCase()).filter(Boolean)

// Raid detection thresholds
const RAIDMODE_TRIGGER_MSGS_5S = parseInt(process.env.KICK_RAIDMODE_TRIGGER_MSGS_5S || '80', 10)
const RAIDMODE_TRIGGER_UNIQUE_5S = parseInt(process.env.KICK_RAIDMODE_TRIGGER_UNIQUE_5S || '40', 10)
const SPAM_PER_USER_MSGS_10S = parseInt(process.env.KICK_SPAM_PER_USER_MSGS_10S || '6', 10)
const SPAM_REPEAT_THRESHOLD = parseInt(process.env.KICK_SPAM_REPEAT_THRESHOLD || '3', 10)
const TIMEOUT_SECONDS = parseInt(process.env.KICK_TIMEOUT_SECONDS || '600', 10)
const BAN_ON_REPEAT_COUNT = parseInt(process.env.KICK_BAN_ON_REPEAT_COUNT || '3', 10)
const RAIDMODE_DURATION_MS = parseInt(process.env.KICK_RAIDMODE_DURATION_MS || '300000', 10)
const MODERATION_COOLDOWN_MS = parseInt(process.env.KICK_MODERATION_COOLDOWN_MS || '60000', 10)

// Advisory lock ID
const ADVISORY_LOCK_ID = BigInt('9223372036854775806')

let isShuttingDown = false
let activeWorkers = 0
let advisoryLockAcquired = false
let startupMessageSent = false

// Stats tracking
let processedCount = 0
let moderationActionsCount = 0
let errorCount = 0

// In-memory state for raid detection
interface MessageWindow {
    timestamp: number
    broadcaster_user_id: bigint
    sender_user_id: bigint
    content_hash: string
}

interface UserOffense {
    count: number
    last_action_at: number
    last_message_hash: string
    repeat_count: number
}

interface RaidState {
    raidModeUntil: number
    messageWindow: MessageWindow[]
    userOffenses: Map<string, UserOffense>
    lastModerationAction: Map<string, number>
}

const raidState = new Map<string, RaidState>()

function getRaidState(broadcasterUserId: bigint): RaidState {
    const key = broadcasterUserId.toString()
    if (!raidState.has(key)) {
        raidState.set(key, {
            raidModeUntil: 0,
            messageWindow: [],
            userOffenses: new Map(),
            lastModerationAction: new Map(),
        })
    }
    return raidState.get(key)!
}

function hashMessageContent(content: string): string {
    const normalized = content.toLowerCase().trim().replace(/\s+/g, ' ')
    let hash = 0
    for (let i = 0; i < normalized.length; i++) {
        const char = normalized.charCodeAt(i)
        hash = ((hash << 5) - hash) + char
        hash = hash & hash
    }
    return hash.toString(36)
}

function isExempt(payload: ChatJobPayload): boolean {
    const senderUsernameLower = payload.sender.username.toLowerCase()
    
    if (senderUsernameLower === payload.broadcaster.username.toLowerCase()) return true
    if (senderUsernameLower === MODERATOR_USERNAME) return true
    if (ALLOWLIST.includes(senderUsernameLower)) return true
    
    if (payload.sender.badges) {
        for (const badge of payload.sender.badges) {
            const badgeType = badge.type?.toLowerCase() || ''
            if (badgeType.includes('mod') || badgeType.includes('admin') || badgeType.includes('staff')) {
                return true
            }
        }
    }
    
    return false
}

function cleanMessageWindow(state: RaidState, now: number): void {
    const cutoff = now - 10000
    state.messageWindow = state.messageWindow.filter(msg => msg.timestamp > cutoff)
}

function checkRaidMode(state: RaidState, broadcasterUserId: bigint, now: number): boolean {
    cleanMessageWindow(state, now)
    
    if (state.raidModeUntil > now) {
        return true
    }
    
    const fiveSecondsAgo = now - 5000
    const recentMessages = state.messageWindow.filter(msg => msg.timestamp > fiveSecondsAgo)
    
    if (recentMessages.length < RAIDMODE_TRIGGER_MSGS_5S) {
        return false
    }
    
    const uniqueSenders = new Set(recentMessages.map(msg => msg.sender_user_id.toString()))
    
    if (uniqueSenders.size >= RAIDMODE_TRIGGER_UNIQUE_5S) {
        state.raidModeUntil = now + RAIDMODE_DURATION_MS
        console.log(`[moderation-worker] 🚨 RAID MODE ACTIVATED for broadcaster ${broadcasterUserId} (${recentMessages.length} msgs, ${uniqueSenders.size} unique senders in 5s)`)
        return true
    }
    
    return false
}

function checkUserSpam(state: RaidState, senderUserId: bigint, contentHash: string, now: number): boolean {
    const key = senderUserId.toString()
    const offense = state.userOffenses.get(key) || {
        count: 0,
        last_action_at: 0,
        last_message_hash: '',
        repeat_count: 0,
    }
    
    if (offense.last_message_hash === contentHash) {
        offense.repeat_count++
    } else {
        offense.repeat_count = 1
    }
    
    const tenSecondsAgo = now - 10000
    const userRecentMessages = state.messageWindow.filter(
        msg => msg.sender_user_id === senderUserId && msg.timestamp > tenSecondsAgo
    )
    
    if (userRecentMessages.length >= SPAM_PER_USER_MSGS_10S) {
        offense.count++
        offense.last_message_hash = contentHash
        state.userOffenses.set(key, offense)
        return true
    }
    
    if (offense.repeat_count >= SPAM_REPEAT_THRESHOLD) {
        offense.count++
        offense.last_message_hash = contentHash
        state.userOffenses.set(key, offense)
        return true
    }
    
    offense.last_message_hash = contentHash
    state.userOffenses.set(key, offense)
    
    return false
}

function isInCooldown(state: RaidState, broadcasterUserId: bigint, senderUserId: bigint, now: number): boolean {
    const key = `${broadcasterUserId}:${senderUserId}`
    const lastAction = state.lastModerationAction.get(key) || 0
    return (now - lastAction) < MODERATION_COOLDOWN_MS
}

function recordModerationAction(state: RaidState, broadcasterUserId: bigint, senderUserId: bigint, now: number): void {
    const key = `${broadcasterUserId}:${senderUserId}`
    state.lastModerationAction.set(key, now)
}

interface ModerationAction {
    type: 'timeout' | 'ban'
    duration_seconds?: number
    reason: string
    rule_id: string
    raid_mode_active: boolean
}

function evaluateMessageForModeration(payload: ChatJobPayload): ModerationAction | null {
    if (!MODERATION_ENABLED) {
        return null
    }
    
    if (isExempt(payload)) {
        return null
    }
    
    const broadcasterUserId = BigInt(payload.broadcaster.kick_user_id)
    const senderUserId = BigInt(payload.sender.kick_user_id)
    const now = Date.now()
    const contentHash = hashMessageContent(payload.content)
    
    const state = getRaidState(broadcasterUserId)
    
    state.messageWindow.push({
        timestamp: now,
        broadcaster_user_id: broadcasterUserId,
        sender_user_id: senderUserId,
        content_hash: contentHash,
    })
    
    if (isInCooldown(state, broadcasterUserId, senderUserId, now)) {
        return null
    }
    
    const raidModeActive = checkRaidMode(state, broadcasterUserId, now) || state.raidModeUntil > now
    
    const isSpam = checkUserSpam(state, senderUserId, contentHash, now)
    
    if (!isSpam && !raidModeActive) {
        return null
    }
    
    const offenseKey = senderUserId.toString()
    const offense = state.userOffenses.get(offenseKey) || {
        count: 0,
        last_action_at: 0,
        last_message_hash: '',
        repeat_count: 0,
    }
    
    let action: ModerationAction | null = null
    
    if (offense.count >= BAN_ON_REPEAT_COUNT) {
        action = {
            type: 'ban',
            reason: `Repeat spam offender (${offense.count} offenses)`,
            rule_id: 'repeat_offender',
            raid_mode_active: raidModeActive,
        }
    } else if (offense.repeat_count >= SPAM_REPEAT_THRESHOLD) {
        action = {
            type: 'timeout',
            duration_seconds: TIMEOUT_SECONDS,
            reason: `Repeated identical messages (${offense.repeat_count}x)`,
            rule_id: 'repeated_message',
            raid_mode_active: raidModeActive,
        }
    } else if (isSpam || raidModeActive) {
        action = {
            type: 'timeout',
            duration_seconds: raidModeActive ? TIMEOUT_SECONDS * 2 : TIMEOUT_SECONDS,
            reason: raidModeActive 
                ? `Spam detected during raid mode` 
                : `Spam detected (${state.messageWindow.filter(m => m.sender_user_id === senderUserId && m.timestamp > now - 10000).length} msgs in 10s)`,
            rule_id: raidModeActive ? 'raid_spam' : 'spam',
            raid_mode_active: raidModeActive,
        }
    }
    
    if (action) {
        recordModerationAction(state, broadcasterUserId, senderUserId, now)
        
        const prefix = DRY_RUN ? '[DRY RUN]' : ''
        console.log(`${prefix}[moderation-worker] ${action.type.toUpperCase()} user ${payload.sender.username} (${senderUserId}): ${action.reason}`)
        
        if (DRY_RUN) {
            return null
        }
    }
    
    return action
}

async function acquireAdvisoryLock(): Promise<boolean> {
    try {
        const result = await db.$queryRaw<Array<{ pg_try_advisory_lock: boolean }>>`
            SELECT pg_try_advisory_lock(${ADVISORY_LOCK_ID}) as pg_try_advisory_lock
        `
        const acquired = result[0]?.pg_try_advisory_lock ?? false
        if (acquired) {
            advisoryLockAcquired = true
            console.log(`[moderation-worker] ✅ Advisory lock acquired (ID: ${ADVISORY_LOCK_ID})`)
        }
        return acquired
    } catch (error) {
        console.error(`[moderation-worker] ❌ Failed to acquire advisory lock:`, error)
        return false
    }
}

async function releaseAdvisoryLock(): Promise<void> {
    if (!advisoryLockAcquired) return
    try {
        await db.$queryRaw`SELECT pg_advisory_unlock(${ADVISORY_LOCK_ID})`
        advisoryLockAcquired = false
        console.log(`[moderation-worker] ✅ Advisory lock released`)
    } catch (error) {
        console.error(`[moderation-worker] ⚠️ Failed to release advisory lock:`, error)
    }
}

async function sendStartupMessage(): Promise<void> {
    if (startupMessageSent) return
    
    try {
        // Get broadcaster user ID from environment or default
        const broadcasterSlug = process.env.KICK_CHANNEL_SLUG || 'sweetflips'
        
        // Try to get broadcaster from database
        const broadcaster = await db.user.findFirst({
            where: {
                username: {
                    equals: broadcasterSlug,
                    mode: 'insensitive',
                },
            },
            select: {
                kick_user_id: true,
            },
        })
        
        if (broadcaster) {
            const result = await sendModeratorChatMessage({
                broadcaster_user_id: broadcaster.kick_user_id,
                content: 'Hi! 🛡️ Moderation bot is online and ready.',
                type: 'bot',
            })
            
            if (result.success) {
                startupMessageSent = true
                console.log(`[moderation-worker] ✅ Startup message sent to chat`)
            } else {
                console.warn(`[moderation-worker] ⚠️ Failed to send startup message: ${result.error}`)
            }
        } else {
            console.warn(`[moderation-worker] ⚠️ Broadcaster not found, skipping startup message`)
        }
    } catch (error) {
        console.warn(`[moderation-worker] ⚠️ Error sending startup message:`, error instanceof Error ? error.message : 'Unknown error')
    }
}

async function shutdown(signal: string): Promise<void> {
    if (isShuttingDown) return
    isShuttingDown = true
    console.log(`\n[moderation-worker] ${signal} received, shutting down...`)
    await releaseAdvisoryLock()
    process.exit(0)
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))

/**
 * Process a single chat job - ONLY moderation checks
 */
async function processModerationJob(job: ClaimedChatJob): Promise<void> {
    const startTime = Date.now()
    const payload = job.payload as ChatJobPayload

    if (VERBOSE_LOGS) {
        console.log(`[moderation-worker] 📥 Processing job id=${job.id}, message_id=${payload.message_id}, sender=${payload.sender.username}, broadcaster=${payload.broadcaster.username}`)
    }

    try {
        const senderUserId = BigInt(payload.sender.kick_user_id)
        const broadcasterUserId = BigInt(payload.broadcaster.kick_user_id)

        // Send startup message on first job
        if (!startupMessageSent) {
            await sendStartupMessage()
        }

        // Moderation check
        const moderationAction = evaluateMessageForModeration(payload)
        if (moderationAction) {
            try {
                const banResult = await moderationBan({
                    broadcaster_user_id: broadcasterUserId,
                    user_id: senderUserId,
                    duration_seconds: moderationAction.duration_seconds,
                    reason: moderationAction.reason,
                })

                if (banResult.success) {
                    moderationActionsCount++
                    
                    // Send chat message announcing the action
                    const actionText = moderationAction.type === 'ban' 
                        ? 'banned' 
                        : `timed out for ${Math.floor((moderationAction.duration_seconds || 0) / 60)} minutes`
                    
                    const announcement = `🛡️ ${payload.sender.username} has been ${actionText}. Reason: ${moderationAction.reason}`
                    
                    await sendModeratorChatMessage({
                        broadcaster_user_id: broadcasterUserId,
                        content: announcement,
                        type: 'bot',
                    }).catch(() => {
                        // Non-critical if announcement fails
                    })
                    
                    console.log(`[moderation-worker] ✅ ${moderationAction.type.toUpperCase()} user ${payload.sender.username} (${moderationAction.reason})`)
                } else {
                    console.warn(`[moderation-worker] ⚠️ Moderation action failed: ${banResult.error}`)
                }
            } catch (modError) {
                console.warn(`[moderation-worker] ⚠️ Error executing moderation action:`, modError instanceof Error ? modError.message : 'Unknown error')
            }
        }

        await completeChatJob(job.id)
        processedCount++

        const duration = Date.now() - startTime
        if (VERBOSE_LOGS && moderationAction) {
            console.log(`[moderation-worker] ✅ Processed moderation check [${duration}ms]`)
        }

    } catch (error) {
        errorCount++
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        console.error(`[moderation-worker] Error processing job ${job.id}:`, errorMessage)
        await failChatJob(job.id, errorMessage, job.attempts)
    }
}

async function processBatch(): Promise<void> {
    if (isShuttingDown) return

    if (activeWorkers >= CONCURRENCY) return

    const availableSlots = CONCURRENCY - activeWorkers
    const batchSize = Math.min(BATCH_SIZE, availableSlots)

    const jobs = await claimChatJobs(batchSize)

    if (jobs.length === 0) {
        return
    }

    const processingPromises = jobs.map(async (job) => {
        activeWorkers++
        try {
            await processModerationJob(job)
        } finally {
            activeWorkers--
        }
    })

    await Promise.all(processingPromises)
}

async function runWorker(): Promise<void> {
    console.log(`[moderation-worker] Starting moderation worker`)
    console.log(`[moderation-worker] Configuration: batchSize=${BATCH_SIZE}, pollInterval=${POLL_INTERVAL_MS}ms, concurrency=${CONCURRENCY}`)

    const lockAcquired = await acquireAdvisoryLock()
    if (!lockAcquired) {
        console.error(`[moderation-worker] Exiting - another moderation worker is running`)
        process.exit(1)
    }

    // Send startup message after a short delay
    setTimeout(() => {
        sendStartupMessage().catch(() => {
            // Non-critical if it fails
        })
    }, 5000)

    let lastStatsLog = Date.now()

    while (!isShuttingDown) {
        try {
            await processBatch()

            const now = Date.now()
            if (now - lastStatsLog >= STATS_INTERVAL_MS) {
                const stats = await getChatQueueStats()
                console.log(`[moderation-worker] Queue: pending=${stats.pending}, processing=${stats.processing}, completed=${stats.completed}, failed=${stats.failed} | Processed: ${processedCount}, Actions: ${moderationActionsCount}, Errors: ${errorCount}`)
                lastStatsLog = now
            }

            await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS))
        } catch (error) {
            console.error(`[moderation-worker] Error in worker loop:`, error)
            await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS * 2))
        }
    }
}

runWorker().catch((error) => {
    console.error(`[moderation-worker] Fatal error:`, error)
    process.exit(1)
})

