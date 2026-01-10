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
import { getModeratorBotSettingsFromDb } from '../lib/moderation-settings'

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
const BAN_ON_REPEAT_COUNT = parseInt(process.env.KICK_BAN_ON_REPEAT_COUNT || '3', 10)
const RAIDMODE_DURATION_MS = parseInt(process.env.KICK_RAIDMODE_DURATION_MS || '300000', 10)
const MODERATION_COOLDOWN_MS = parseInt(process.env.KICK_MODERATION_COOLDOWN_MS || '60000', 10)

// Advisory lock ID (must be unique per worker type; point-worker uses 9223372036854775806)
const ADVISORY_LOCK_ID = BigInt('9223372036854775807')

let isShuttingDown = false
let activeWorkers = 0
let advisoryLockAcquired = false
let startupMessageSent = false

// Stats tracking
let processedCount = 0
let moderationActionsCount = 0
let errorCount = 0
let botRepliesCount = 0

// Bot reply cooldown tracking (per broadcaster)
const botReplyCooldowns = new Map<string, number>()

// Reply policy
// We ONLY reply when the bot is mentioned + the message looks like a request/question.
const BOT_REPLY_REQUIRE_MENTION = String(process.env.BOT_REPLY_REQUIRE_MENTION || 'true').toLowerCase() !== 'false'

// Safety override for testing (will still respect mention requirement unless BOT_REPLY_REQUIRE_MENTION=false)
const FORCE_BOT_REPLIES = String(process.env.BOT_REPLY_ALWAYS || '').toLowerCase() === 'true'
const FORCE_BOT_REPLIES_COOLDOWN_MS = Number.isFinite(Number(process.env.BOT_REPLY_ALWAYS_COOLDOWN_MS))
    ? Math.max(0, Math.trunc(Number(process.env.BOT_REPLY_ALWAYS_COOLDOWN_MS)))
    : 4000

function normalizeText(s: string) {
    return (s || '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim()
}

function isBotMentioned(content: string, botUsernameLower: string): boolean {
    const text = normalizeText(content)
    if (!text) return false

    // Common mention patterns
    if (text.includes(`@${botUsernameLower}`)) return true

    // Word boundary match for plain mentions ("sweetflipsbot")
    const re = new RegExp(`\\b${botUsernameLower.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}\\b`, 'i')
    return re.test(text)
}

function looksLikeRequestOrQuestion(content: string): boolean {
    const text = normalizeText(content)
    if (!text) return false

    // Questions / asks
    if (text.includes('?')) return true
    if (text.startsWith('can you') || text.startsWith('could you') || text.startsWith('would you')) return true
    if (text.includes('can you ') || text.includes('could you ') || text.includes('help ') || text.includes('how ') || text.includes('what ') || text.includes('why ')) return true

    // Command-style pings
    if (text.includes('!') || text.includes('/')) return true

    // "botname do X" / "botname pls" etc
    if (/\b(pls|please|plz)\b/.test(text)) return true

    return false
}

// In-memory state for raid detection
const TIMEOUT_SECONDS = 600
const BAD_WORDS = ['scam', 'cheat', 'rigged']
const SIMILARITY_THRESHOLD = 0.8

interface MessageWindow {
    timestamp: number
    broadcaster_user_id: bigint
    sender_user_id: bigint
    content_hash: string
    content_raw: string
}

interface UserOffense {
    count: number
    last_action_at: number
    last_message_hash: string
    last_message_raw: string
    repeat_count: number
    violation_level: number // 0=Clean, 1=Warned, 2=TimedOut, 3=Bannable
    last_violation_at: number
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

function levenshteinDistance(a: string, b: string): number {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;

    const matrix = [];

    for (let i = 0; i <= b.length; i++) {
        matrix[i] = [i];
    }

    for (let j = 0; j <= a.length; j++) {
        matrix[0][j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) == a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1,
                    Math.min(matrix[i][j - 1] + 1,
                        matrix[i - 1][j] + 1));
            }
        }
    }

    return matrix[b.length][a.length];
}

function calculateSimilarity(s1: string, s2: string): number {
    const longer = s1.length > s2.length ? s1 : s2;
    if (longer.length === 0) {
        return 1.0;
    }
    return (longer.length - levenshteinDistance(s1, s2)) / longer.length;
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

async function generateAIReply(messageContent: string, senderUsername: string): Promise<string | null> {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
        console.warn('[moderation-worker] ⚠️ OPENAI_API_KEY not set, skipping AI reply')
        return null
    }

    try {
        const preferredModel = process.env.OPENAI_CHAT_MODEL || 'gpt-4o-mini'
        const fallbackModel = 'gpt-4o-mini'
        const temperature = Number.isFinite(Number(process.env.OPENAI_CHAT_TEMPERATURE))
            ? Math.max(0, Math.min(2, Number(process.env.OPENAI_CHAT_TEMPERATURE)))
            : 0.9
        const maxTokens = Number.isFinite(Number(process.env.OPENAI_CHAT_MAX_TOKENS))
            ? Math.max(16, Math.min(256, Math.trunc(Number(process.env.OPENAI_CHAT_MAX_TOKENS))))
            : 140

        const buildPayload = (model: string) => ({
            model,
            messages: [
                {
                    role: 'system',
                    content:
                        'You are Sweetflipsbot, a real-sounding human chat assistant in a Kick gambling streamer chat.\n' +
                        'ONLY reply when the user explicitly mentions you and is asking something.\n' +
                        'Tone: natural, chill, witty, a little streamer-chat energy, not corporate.\n' +
                        'Write 1 short message. Max ~220 characters.\n' +
                        'No roleplay, no disclaimers, no "as an AI".\n' +
                        'No spam. Don\'t start conversations.\n' +
                        'If asked about gambling: be hype but responsible; don\'t promise wins.\n' +
                        'If the ask is unclear: ask one short clarifying question.\n' +
                        'If toxic/bait: de-escalate or ignore with a neutral short reply.\n' +
                        'Do not mention policies/moderation actions.',
                },
                {
                    role: 'user',
                    content:
                        `Someone in chat said:\n` +
                        `${senderUsername}: ${messageContent}\n\n` +
                        `Reply like a normal person (only answer what they asked).`,
                },
            ],
            max_tokens: maxTokens,
            temperature,
        })

        const callOpenAI = async (model: string) => {
            return await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                },
                body: JSON.stringify(buildPayload(model)),
            })
        }

        let response = await callOpenAI(preferredModel)

        if (!response.ok) {
            const errorText = await response.text()
            const looksLikeModelIssue =
                response.status === 404 ||
                (response.status === 400 && /model/i.test(errorText))

            if (looksLikeModelIssue && preferredModel !== fallbackModel) {
                console.warn(`[moderation-worker] ⚠️ OpenAI model "${preferredModel}" not available; falling back to "${fallbackModel}"`)
                response = await callOpenAI(fallbackModel)
                if (!response.ok) {
                    const fallbackErrorText = await response.text()
                    console.warn(`[moderation-worker] ⚠️ OpenAI API error (fallback): ${response.status} ${fallbackErrorText.substring(0, 200)}`)
                    return null
                }
            } else {
                console.warn(`[moderation-worker] ⚠️ OpenAI API error: ${response.status} ${errorText.substring(0, 200)}`)
                return null
            }
        }

        const data = await response.json()
        let reply = data.choices?.[0]?.message?.content?.trim()

        if (!reply || reply.length === 0) {
            return null
        }

        reply = reply.replace(/^["'“”]+|["'“”]+$/g, '').trim()
        return reply.length > 500 ? reply.substring(0, 497) + '...' : reply
    } catch (error) {
        console.warn(`[moderation-worker] ⚠️ Error generating AI reply:`, error instanceof Error ? error.message : 'Unknown error')
        return null
    }
}

/**
 * Generate a bot reply to a chat message
 * Uses AI if enabled, otherwise falls back to simple keyword-based replies
 */
async function generateBotReply(messageContent: string, senderUsername: string, useAI: boolean): Promise<string | null> {
    const openAiConfigured = Boolean(process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim())
    const forceAiReplies = String(process.env.BOT_REPLY_USE_AI_ALWAYS || '').toLowerCase() === 'true'
    const aiEnabledEffective = forceAiReplies ? true : (useAI || openAiConfigured)

    if (aiEnabledEffective) {
        const aiReply = await generateAIReply(messageContent, senderUsername)
        if (aiReply) {
            return aiReply
        }
    }

    const content = messageContent.toLowerCase().trim()

    if (content.includes('hello') || content.includes('hi') || content.includes('hey')) {
        return pickOne(['yo', 'hey', 'heyy', 'sup', 'yo what\'s up']) + (Math.random() < 0.35 ? ' 👋' : '')
    }
    if (content.includes('bye') || content.includes('goodbye')) {
        return pickOne(['later', 'cya', 'see ya', 'take it easy']) + (Math.random() < 0.3 ? ' 👋' : '')
    }
    if (content.includes('thanks') || content.includes('thank you')) {
        return pickOne(['np', 'no worries', 'anytime', 'got you']) + (Math.random() < 0.25 ? ' 🤝' : '')
    }
    if (content.includes('?') && content.length < 100) {
        return pickOne(['hmm good question', 'not sure tbh—what do you mean exactly?', 'depends—what are you trying to do?'])
    }
    if (content.includes('lol') || content.includes('haha')) {
        return pickOne(['lmao', '😂', 'lol'])
    }
    if (content.includes('love') || content.includes('❤️')) {
        return pickOne(['❤️', 'love that', 'big W'])
    }

    return null
}

function pickOne<T>(items: T[]): T {
    return items[Math.floor(Math.random() * items.length)]
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

function checkUserSpam(state: RaidState, senderUserId: bigint, contentRaw: string, contentHash: string, now: number): boolean {
    const key = senderUserId.toString()
    let offense = state.userOffenses.get(key)

    // Initialize if not exists
    if (!offense) {
        offense = {
            count: 0,
            last_action_at: 0,
            last_message_hash: '',
            last_message_raw: '',
            repeat_count: 0,
            violation_level: 0,
            last_violation_at: 0
        }
    }

    // Reset logic: If clean for 5 minutes, reduce strike level
    if (now - offense.last_violation_at > 300000) {
        offense.violation_level = Math.max(0, offense.violation_level - 1)
        offense.repeat_count = 0
    }

    // Fuzzy Check
    const similarity = calculateSimilarity(contentRaw, offense.last_message_raw)
    const isSimilar = similarity >= SIMILARITY_THRESHOLD
    const isExact = contentHash === offense.last_message_hash

    if (isSimilar || isExact) {
        offense.repeat_count++
    } else {
        offense.repeat_count = 1
    }

    // Update raw content for next check
    offense.last_message_raw = contentRaw
    offense.last_message_hash = contentHash

    // Thresholds
    const isSpamLimit = offense.repeat_count >= SPAM_REPEAT_THRESHOLD

    // Burst Check (many messages in 10s regardless of content)
    const tenSecondsAgo = now - 10000
    const userRecentMessages = state.messageWindow.filter(
        msg => msg.sender_user_id === senderUserId && msg.timestamp > tenSecondsAgo
    )
    const isBurstLimit = userRecentMessages.length >= SPAM_PER_USER_MSGS_10S

    const result = isSpamLimit || isBurstLimit

    state.userOffenses.set(key, offense)
    return result
}

function checkBadWords(content: string): boolean {
    const text = content.toLowerCase()
    return BAD_WORDS.some(word => text.includes(word))
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
    type: 'warn' | 'timeout' | 'ban'
    duration_seconds?: number
    reason: string
    rule_id: string
    raid_mode_active: boolean
    message_to_send?: string
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
    const contentRaw = payload.content.toLowerCase().trim()
    const contentHash = hashMessageContent(payload.content)

    const state = getRaidState(broadcasterUserId)

    state.messageWindow.push({
        timestamp: now,
        broadcaster_user_id: broadcasterUserId,
        sender_user_id: senderUserId,
        content_hash: contentHash,
        content_raw: contentRaw
    })

    if (isInCooldown(state, broadcasterUserId, senderUserId, now)) {
        return null
    }

    const raidModeActive = checkRaidMode(state, broadcasterUserId, now) || state.raidModeUntil > now
    const isSpam = checkUserSpam(state, senderUserId, contentRaw, contentHash, now)
    const isBadWord = checkBadWords(contentRaw)

    if (!isSpam && !raidModeActive && !isBadWord) {
        return null
    }

    const key = senderUserId.toString()
    let offense = state.userOffenses.get(key)!

    offense.violation_level = Math.min(3, offense.violation_level + 1)
    offense.last_violation_at = now
    state.userOffenses.set(key, offense)

    let action: ModerationAction | null = null

    // Immediate Ban for Raid Mode (Strict)
    if (raidModeActive && offense.violation_level >= 1) {
        action = {
            type: 'ban',
            reason: 'Spam during Raid Mode',
            rule_id: 'raid_ban',
            raid_mode_active: true
        }
    } else {
        // Strike System
        switch (offense.violation_level) {
            case 1: // Strike 1: Warning
                action = {
                    type: 'warn',
                    reason: isBadWord ? 'Language warning' : 'Spam warning',
                    rule_id: 'warn_first',
                    raid_mode_active: false,
                    message_to_send: `@${payload.sender.username} ⚠️ Please stop spamming or using bad language.`
                }
                break
            case 2: // Strike 2: Timeout
                action = {
                    type: 'timeout',
                    duration_seconds: TIMEOUT_SECONDS, // 600s = 10m
                    reason: 'Repeated violation (Strike 2)',
                    rule_id: 'timeout_strike_2',
                    raid_mode_active: false
                }
                break
            case 3: // Strike 3: Ban
                action = {
                    type: 'ban',
                    reason: 'Persistent violation (Strike 3)',
                    rule_id: 'ban_strike_3',
                    raid_mode_active: false
                }
                break
            default:
                action = {
                    type: 'timeout',
                    duration_seconds: TIMEOUT_SECONDS,
                    reason: 'Violation',
                    rule_id: 'default',
                    raid_mode_active: false
                }
        }
    }

    if (action) {
        recordModerationAction(state, broadcasterUserId, senderUserId, now)
        const prefix = DRY_RUN ? '[DRY RUN] ' : ''
        if (DRY_RUN) {
            console.log(`${prefix}[moderation-worker] Action determined (DRY RUN): ${action.type.toUpperCase()}`)
            // Do NOT return null here. Return the action so the main loop handles it (and skips bot reply).
            // The main loop must handle blocking the actual API call for bans.
        } else {
            console.log(`${prefix}[moderation-worker] ${action.type.toUpperCase()} user ${payload.sender.username} (${senderUserId}): ${action.reason}`)
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
                type: 'user',
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
                if (moderationAction.type === 'warn') {
                    // Warning: Just send message
                    await sendModeratorChatMessage({
                        broadcaster_user_id: broadcasterUserId,
                        content: moderationAction.message_to_send || `@${payload.sender.username} ⚠️ Warning: ${moderationAction.reason}`,
                        type: 'user'
                    })
                    moderationActionsCount++
                    console.log(`[moderation-worker] ✅ WARNED user ${payload.sender.username} (${moderationAction.reason})`)
                } else {
                    let banResult;
                    if (DRY_RUN && moderationAction.type === 'ban') {
                        console.log(`[moderation-worker] [DRY RUN] Skipping actual BAN API call for ${payload.sender.username}`)
                        banResult = { success: true, error: null } // Simulate success
                    } else {
                        banResult = await moderationBan({
                            broadcaster_user_id: broadcasterUserId,
                            user_id: senderUserId,
                            duration_seconds: moderationAction.duration_seconds,
                            reason: moderationAction.reason,
                        })
                    }

                    if (banResult.success) {
                        moderationActionsCount++

                        // Send chat message announcing the action
                        const actionText = moderationAction.type === 'ban'
                            ? 'banned'
                            : `timed out for ${Math.floor((moderationAction.duration_seconds || 0) / 60)} minutes`

                        if (DRY_RUN && moderationAction.type === 'ban') {
                            // Don't announce bans in chat during dry run to avoid confusion? 
                            // User asked for "Logs only". 
                            // But warnings/timeouts are live.
                            console.log(`[moderation-worker] [DRY RUN] Skipping chat announcement for BAN`)
                        } else {
                            const announcement = `🛡️ ${payload.sender.username} has been ${actionText}. Reason: ${moderationAction.reason}`
                            await sendModeratorChatMessage({
                                broadcaster_user_id: broadcasterUserId,
                                content: announcement,
                                type: 'user',
                            }).catch(() => {
                                // Non-critical if announcement fails
                            })
                        }

                        console.log(`[moderation-worker] ✅ ${moderationAction.type.toUpperCase()} user ${payload.sender.username} (${moderationAction.reason})`)
                    } else {
                        console.warn(`[moderation-worker] ⚠️ Moderation action failed: ${banResult.error}`)
                    }
                }
            } catch (modError) {
                console.warn(`[moderation-worker] ⚠️ Error executing moderation action:`, modError instanceof Error ? modError.message : 'Unknown error')
            }
        } else {
            // Bot reply check (ONLY if no moderation action was taken)
            try {
                const settings = await getModeratorBotSettingsFromDb()
                const replyEnabled = FORCE_BOT_REPLIES ? true : settings.bot_reply_enabled
                const replyCooldownMs = FORCE_BOT_REPLIES ? FORCE_BOT_REPLIES_COOLDOWN_MS : settings.bot_reply_cooldown_ms
                const aiReplyEnabled = FORCE_BOT_REPLIES ? true : settings.ai_reply_enabled

                if (!replyEnabled) {
                    if (VERBOSE_LOGS) {
                        console.log(`[moderation-worker] 💬 Bot replies disabled (bot_reply_enabled=false)`)
                    }
                } else if (isExempt(payload)) {
                    if (VERBOSE_LOGS) {
                        console.log(`[moderation-worker] 💬 Skipping reply - user is exempt: ${payload.sender.username}`)
                    }
                } else if (
                    BOT_REPLY_REQUIRE_MENTION &&
                    (!isBotMentioned(payload.content, MODERATOR_USERNAME) || !looksLikeRequestOrQuestion(payload.content))
                ) {
                    if (VERBOSE_LOGS) {
                        const mentioned = isBotMentioned(payload.content, MODERATOR_USERNAME)
                        const asked = looksLikeRequestOrQuestion(payload.content)
                        console.log(`[moderation-worker] 💬 Skipping reply - require mention+ask (mentioned=${mentioned}, asked=${asked})`)
                    }
                } else {
                    const broadcasterKey = broadcasterUserId.toString()
                    const now = Date.now()
                    const lastReplyTime = botReplyCooldowns.get(broadcasterKey) || 0
                    const timeSinceLastReply = now - lastReplyTime

                    // Check cooldown
                    if (timeSinceLastReply < replyCooldownMs) {
                        if (VERBOSE_LOGS) {
                            const remaining = Math.ceil((replyCooldownMs - timeSinceLastReply) / 1000)
                            console.log(`[moderation-worker] 💬 Bot reply on cooldown (${remaining}s remaining)`)
                        }
                    } else {
                        // No randomness: if we reached here, we reply.
                        // Generate reply using AI if enabled, otherwise simple fallback
                        const replyText = await generateBotReply(
                            payload.content,
                            payload.sender.username,
                            aiReplyEnabled
                        )

                        if (!replyText) {
                            if (VERBOSE_LOGS) {
                                console.log(`[moderation-worker] 💬 No reply generated for message: "${payload.content.substring(0, 50)}..."`)
                            }
                        } else {
                            const replyResult = await sendModeratorChatMessage({
                                broadcaster_user_id: broadcasterUserId,
                                content: replyText,
                                type: 'user',
                            })

                            if (replyResult.success) {
                                botRepliesCount++
                                botReplyCooldowns.set(broadcasterKey, now)
                                const replyType = aiReplyEnabled ? 'AI' : 'simple'
                                console.log(`[moderation-worker] 💬 Bot replied (${replyType}): ${replyText.substring(0, 50)}...`)
                            } else {
                                console.warn(`[moderation-worker] ⚠️ Bot reply failed: ${replyResult.error}`)
                            }
                        }
                    }
                }
            } catch (replyError) {
                // Non-critical - don't fail the job if bot reply fails
                console.warn(`[moderation-worker] ⚠️ Error processing bot reply:`, replyError instanceof Error ? replyError.message : 'Unknown error')
                if (VERBOSE_LOGS && replyError instanceof Error) {
                    console.warn(`[moderation-worker] ⚠️ Bot reply error stack:`, replyError.stack)
                }
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
                console.log(`[moderation-worker] Queue: pending=${stats.pending}, processing=${stats.processing}, completed=${stats.completed}, failed=${stats.failed} | Processed: ${processedCount}, Actions: ${moderationActionsCount}, Replies: ${botRepliesCount}, Errors: ${errorCount}`)
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
