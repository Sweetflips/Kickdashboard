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
import { getModeratorBotSettingsFromDb, logModerationAction, logBotReply, type ModeratorBotSettings } from '../lib/moderation-settings'

const BATCH_SIZE = parseInt(process.env.MODERATION_WORKER_BATCH_SIZE || '50', 10)
const POLL_INTERVAL_MS = parseInt(process.env.MODERATION_WORKER_POLL_INTERVAL_MS || '500', 10)
const CONCURRENCY = parseInt(process.env.MODERATION_WORKER_CONCURRENCY || '10', 10)
const STATS_INTERVAL_MS = parseInt(process.env.MODERATION_WORKER_STATS_INTERVAL_MS || '60000', 10)
const VERBOSE_LOGS = process.env.MODERATION_WORKER_VERBOSE_LOGS === 'true'

// Moderation configuration
const MODERATION_ENABLED = process.env.KICK_MODERATION_ENABLED !== 'false'
const DRY_RUN = process.env.KICK_MODERATION_DRY_RUN === '1'
const MODERATOR_USERNAME = (process.env.KICK_MODERATOR_USERNAME || 'sweetflipsbot').toLowerCase()
const ALLOWLIST = (process.env.KICK_MODERATION_ALLOWLIST || '').split(',').map((u: any) => u.trim().toLowerCase()).filter(Boolean)

// Raid detection thresholds
const RAIDMODE_TRIGGER_MSGS_5S = parseInt(process.env.KICK_RAIDMODE_TRIGGER_MSGS_5S || '80', 10)
const RAIDMODE_TRIGGER_UNIQUE_5S = parseInt(process.env.KICK_RAIDMODE_TRIGGER_UNIQUE_5S || '40', 10)
const SPAM_PER_USER_MSGS_10S = parseInt(process.env.KICK_SPAM_PER_USER_MSGS_10S || '6', 10)
const SPAM_REPEAT_THRESHOLD = parseInt(process.env.KICK_SPAM_REPEAT_THRESHOLD || '3', 10)
const TIMEOUT_SECONDS = parseInt(process.env.KICK_TIMEOUT_SECONDS || '600', 10)
const BAN_ON_REPEAT_COUNT = parseInt(process.env.KICK_BAN_ON_REPEAT_COUNT || '3', 10)
const RAIDMODE_DURATION_MS = parseInt(process.env.KICK_RAIDMODE_DURATION_MS || '300000', 10)
const MODERATION_COOLDOWN_MS = parseInt(process.env.KICK_MODERATION_COOLDOWN_MS || '60000', 10)

// Advisory lock ID (must be unique per worker type; point-worker uses 9223372036854775806)
const ADVISORY_LOCK_ID = BigInt('9223372036854775807')

// OpenAI moderation settings (AI moderation decisions, not chat replies)
const OPENAI_MODERATION_MODEL = process.env.OPENAI_MODERATION_MODEL || 'omni-moderation-latest'
const OPENAI_MODERATION_SCORE_THRESHOLD = Number.isFinite(Number(process.env.OPENAI_MODERATION_SCORE_THRESHOLD))
    ? Math.max(0, Math.min(1, Number(process.env.OPENAI_MODERATION_SCORE_THRESHOLD)))
    : 0.85
const OPENAI_MODERATION_TIMEOUT_SECONDS = Number.isFinite(Number(process.env.OPENAI_MODERATION_TIMEOUT_SECONDS))
    ? Math.max(60, Math.trunc(Number(process.env.OPENAI_MODERATION_TIMEOUT_SECONDS)))
    : TIMEOUT_SECONDS

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
// Optional stricter mode: require an ask/question (or greeting) in addition to mention.
// Default false = any mention triggers a reply.
const BOT_REPLY_REQUIRE_ASK = String(process.env.BOT_REPLY_REQUIRE_ASK || 'false').toLowerCase() === 'true'

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

function isExemptFromModeration(payload: ChatJobPayload): boolean {
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

function isExemptFromReplies(payload: ChatJobPayload): boolean {
    // Only avoid replying to ourselves (prevents reply loops).
    // Broadcaster/mod/staff/admin should still be able to talk to the bot.
    const senderUsernameLower = payload.sender.username.toLowerCase()
    return senderUsernameLower === MODERATOR_USERNAME
}

function looksLikeGreeting(content: string): boolean {
    const text = normalizeText(content)
    if (!text) return false
    return /\b(hi|hello|hey|yo|sup|what's up|whats up)\b/.test(text)
}

function isOnlyBotMention(content: string, botUsernameLower: string): boolean {
    const text = normalizeText(content)
    if (!text) return false

    // Remove common mention patterns then see if anything meaningful remains
    const withoutAt = text.replaceAll(`@${botUsernameLower}`, '').trim()
    const withoutPlain = withoutAt.replace(
        new RegExp(`\\b${botUsernameLower.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}\\b`, 'gi'),
        ''
    ).trim()
    const leftover = withoutPlain.replace(/[^\w]+/g, '').trim()
    return leftover.length === 0
}

/**
 * Generate a bot reply using OpenAI API
 */
async function generateAIReply(messageContent: string, senderUsername: string, chatSettings: { model: string; temperature: number; maxTokens: number }): Promise<string | null> {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
        console.warn('[moderation-worker] ⚠️ OPENAI_API_KEY not set, skipping AI reply')
        return null
    }

    try {
        const preferredModel = chatSettings.model
        const fallbackModel = 'gpt-4o-mini'
        const temperature = chatSettings.temperature
        const maxTokens = chatSettings.maxTokens

        const buildPayload = (model: string) => ({
            model,
            messages: [
                {
                    role: 'system',
                    content:
                        'You are Sweetflipsbot, a real-sounding human chat assistant in a Kick gambling streamer chat.\n' +
                        'ONLY reply when the user explicitly mentions you.\n' +
                        'Tone: natural, chill, witty, a little streamer-chat energy, not corporate.\n' +
                        'Write 1 short message. Max ~220 characters.\n' +
                        'No roleplay, no disclaimers, no "as an AI".\n' +
                        'No spam. Don\'t start conversations.\n' +
                        'If asked about gambling: be hype but responsible; don\'t promise wins.\n' +
                        'If the user just pings you / unclear: reply with a short friendly prompt like "yo?" or ask one clarifying question.\n' +
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

        // Light cleanup so it doesn't look "generated"
        reply = reply.replace(/^["'“”]+|["'“”]+$/g, '').trim()

        // Ensure reply is under 500 chars (Kick API limit)
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
async function generateBotReply(messageContent: string, senderUsername: string, useAI: boolean, chatSettings: { model: string; temperature: number; maxTokens: number }): Promise<string | null> {
    // If OpenAI is configured, prefer AI replies by default (unless explicitly disabled).
    const openAiConfigured = Boolean(process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim())
    const forceAiReplies = String(process.env.BOT_REPLY_USE_AI_ALWAYS || '').toLowerCase() === 'true'
    const aiEnabledEffective = forceAiReplies ? true : (useAI || openAiConfigured)

    // Try AI first if enabled
    if (aiEnabledEffective) {
        const aiReply = await generateAIReply(messageContent, senderUsername, chatSettings)
        if (aiReply) {
            return aiReply
        }
        // Fall back to simple replies if AI fails
    }

    // Simple keyword-based replies (works offline, fallback)
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

type OpenAIModerationResult = {
    flagged: boolean
    categories: Record<string, boolean> | null
    category_scores: Record<string, number> | null
}

let lastMissingOpenAIKeyWarnAt = 0
let lastOpenAIModerationErrorAt = 0

// Cache AI moderation results by content hash to reduce cost and improve consistency
const aiModerationCache = new Map<string, { at: number; result: OpenAIModerationResult }>()
const AI_MODERATION_CACHE_TTL_MS = Number.isFinite(Number(process.env.OPENAI_MODERATION_CACHE_TTL_MS))
    ? Math.max(0, Math.trunc(Number(process.env.OPENAI_MODERATION_CACHE_TTL_MS)))
    : 120000

function getCachedAIModeration(contentHash: string, cacheTtlMs: number): OpenAIModerationResult | null {
    const entry = aiModerationCache.get(contentHash)
    if (!entry) return null
    if (cacheTtlMs > 0 && (Date.now() - entry.at) > cacheTtlMs) {
        aiModerationCache.delete(contentHash)
        return null
    }
    return entry.result
}

function setCachedAIModeration(contentHash: string, result: OpenAIModerationResult): void {
    aiModerationCache.set(contentHash, { at: Date.now(), result })
    // Simple bounded cache
    const max = Number.isFinite(Number(process.env.OPENAI_MODERATION_CACHE_MAX))
        ? Math.max(128, Math.trunc(Number(process.env.OPENAI_MODERATION_CACHE_MAX)))
        : 2048
    if (aiModerationCache.size > max) {
        const firstKey = aiModerationCache.keys().next().value
        if (firstKey) aiModerationCache.delete(firstKey)
    }
}

function summarizeModerationScores(scores: Record<string, number> | null, threshold: number): string {
    if (!scores) return ''
    const entries = Object.entries(scores)
        .filter(([, v]) => typeof v === 'number' && v >= threshold)
        .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
        .slice(0, 3)
        .map(([k, v]) => `${k} ${(v * 100).toFixed(0)}%`)
    return entries.length ? entries.join(', ') : ''
}

async function runOpenAIModeration(content: string, contentHash: string, cacheTtlMs: number, model: string): Promise<OpenAIModerationResult | null> {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey || !apiKey.trim()) {
        const now = Date.now()
        if (now - lastMissingOpenAIKeyWarnAt > 60000) {
            lastMissingOpenAIKeyWarnAt = now
            console.warn('[moderation-worker] ⚠️ OPENAI_API_KEY not set, skipping AI moderation')
        }
        return null
    }

    const cached = getCachedAIModeration(contentHash, cacheTtlMs)
    if (cached) return cached

    try {
        const response = await fetch('https://api.openai.com/v1/moderations', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: model,
                input: content,
            }),
        })

        if (!response.ok) {
            const errorText = await response.text()
            const now = Date.now()
            if (now - lastOpenAIModerationErrorAt > 60000) {
                lastOpenAIModerationErrorAt = now
                console.warn(`[moderation-worker] ⚠️ OpenAI moderation API error: ${response.status} ${errorText.substring(0, 200)}`)
            }
            return null
        }

        const data = await response.json()
        const result = data?.results?.[0]
        const parsed: OpenAIModerationResult = {
            flagged: Boolean(result?.flagged),
            categories: result?.categories && typeof result.categories === 'object' ? result.categories : null,
            category_scores: result?.category_scores && typeof result.category_scores === 'object' ? result.category_scores : null,
        }
        setCachedAIModeration(contentHash, parsed)
        return parsed
    } catch (error) {
        const now = Date.now()
        if (now - lastOpenAIModerationErrorAt > 60000) {
            lastOpenAIModerationErrorAt = now
            console.warn(`[moderation-worker] ⚠️ Error calling OpenAI moderation:`, error instanceof Error ? error.message : 'Unknown error')
        }
        return null
    }
}

function checkRaidMode(state: RaidState, broadcasterUserId: bigint, now: number, settings: ModeratorBotSettings): boolean {
    cleanMessageWindow(state, now)

    if (state.raidModeUntil > now) {
        return true
    }

    const triggerMsgs = settings.raid_mode_trigger_msgs_5s ?? RAIDMODE_TRIGGER_MSGS_5S
    const triggerUnique = settings.raid_mode_trigger_unique_5s ?? RAIDMODE_TRIGGER_UNIQUE_5S
    const durationMs = settings.raid_mode_duration_ms ?? RAIDMODE_DURATION_MS

    const fiveSecondsAgo = now - 5000
    const recentMessages = state.messageWindow.filter(msg => msg.timestamp > fiveSecondsAgo)

    if (recentMessages.length < triggerMsgs) {
        return false
    }

    const uniqueSenders = new Set(recentMessages.map((msg: any) => msg.sender_user_id.toString()))

    if (uniqueSenders.size >= triggerUnique) {
        state.raidModeUntil = now + durationMs
        console.log(`[moderation-worker] 🚨 RAID MODE ACTIVATED for broadcaster ${broadcasterUserId} (${recentMessages.length} msgs, ${uniqueSenders.size} unique senders in 5s)`)
        return true
    }

    return false
}

function checkUserSpam(state: RaidState, senderUserId: bigint, contentHash: string, now: number, settings: ModeratorBotSettings): boolean {
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

    const spamPerUser = settings.spam_per_user_msgs_10s ?? SPAM_PER_USER_MSGS_10S
    const repeatThreshold = settings.spam_repeat_threshold ?? SPAM_REPEAT_THRESHOLD

    const tenSecondsAgo = now - 10000
    const userRecentMessages = state.messageWindow.filter(
        msg => msg.sender_user_id === senderUserId && msg.timestamp > tenSecondsAgo
    )

    if (userRecentMessages.length >= spamPerUser) {
        offense.count++
        offense.last_message_hash = contentHash
        state.userOffenses.set(key, offense)
        return true
    }

    if (offense.repeat_count >= repeatThreshold) {
        offense.count++
        offense.last_message_hash = contentHash
        state.userOffenses.set(key, offense)
        return true
    }

    offense.last_message_hash = contentHash
    state.userOffenses.set(key, offense)

    return false
}

function isInCooldown(state: RaidState, broadcasterUserId: bigint, senderUserId: bigint, now: number, settings: ModeratorBotSettings): boolean {
    const key = `${broadcasterUserId}:${senderUserId}`
    const lastAction = state.lastModerationAction.get(key) || 0
    const cooldownMs = settings.moderation_cooldown_ms ?? MODERATION_COOLDOWN_MS
    return (now - lastAction) < cooldownMs
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
    ai_categories?: Record<string, boolean> | null
    ai_max_score?: number
}

async function evaluateMessageForModeration(payload: ChatJobPayload, settings: ModeratorBotSettings): Promise<ModerationAction | null> {
    if (!MODERATION_ENABLED) {
        return null
    }

    if (isExemptFromModeration(payload)) {
        return null
    }

    // Also check settings allowlist (in addition to env var allowlist)
    const senderUsernameLower = payload.sender.username.toLowerCase()
    if (settings.moderation_allowlist?.includes(senderUsernameLower)) {
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

    if (isInCooldown(state, broadcasterUserId, senderUserId, now, settings)) {
        return null
    }

    const raidModeActive = checkRaidMode(state, broadcasterUserId, now, settings) || state.raidModeUntil > now

    // AI moderation (toxicity / harassment / hate / sexual / violence etc)
    // This is the "AI mods" path; if enabled and the model flags it (or scores exceed threshold), we act.
    if (settings.ai_moderation_enabled) {
        const content = String(payload.content || '').trim()
        if (content.length > 0) {
            // Use score threshold from settings (with fallback to env var)
            const scoreThreshold = settings.ai_moderation_score_threshold ?? OPENAI_MODERATION_SCORE_THRESHOLD
            const cacheTtlMs = settings.ai_moderation_cache_ttl_ms ?? AI_MODERATION_CACHE_TTL_MS
            const moderationModel = settings.ai_moderation_model || OPENAI_MODERATION_MODEL
            const ai = await runOpenAIModeration(content, contentHash, cacheTtlMs, moderationModel)
            if (ai) {
                const scores = ai.category_scores
                const scoreValues = scores ? Object.values(scores).filter(v => typeof v === 'number') : []
                const maxScore = scoreValues.length ? Math.max(...scoreValues) : 0
                const shouldAct = ai.flagged || (Number.isFinite(maxScore) && maxScore >= scoreThreshold)
                if (shouldAct) {
                    const scoreSummary = summarizeModerationScores(scores, scoreThreshold)
                    const reason = scoreSummary
                        ? `AI moderation flagged: ${scoreSummary}`
                        : `AI moderation flagged`

                    // Use timeout duration from settings
                    const aiTimeoutSeconds = settings.ai_moderation_timeout_seconds ?? OPENAI_MODERATION_TIMEOUT_SECONDS
                    const actionType = settings.ai_action === 'ban' ? 'ban' : 'timeout'
                    const action: ModerationAction = actionType === 'ban'
                        ? {
                            type: 'ban',
                            reason,
                            rule_id: 'ai_moderation',
                            raid_mode_active: raidModeActive,
                            ai_categories: ai.categories,
                            ai_max_score: maxScore,
                        }
                        : {
                            type: 'timeout',
                            duration_seconds: aiTimeoutSeconds,
                            reason,
                            rule_id: 'ai_moderation',
                            raid_mode_active: raidModeActive,
                            ai_categories: ai.categories,
                            ai_max_score: maxScore,
                        }

                    recordModerationAction(state, broadcasterUserId, senderUserId, now)
                    console.log(`[moderation-worker] 🤖 ${action.type.toUpperCase()} user ${payload.sender.username} (${senderUserId}): ${action.reason}`)

                    return action
                }
            }
        }
    }

    // Skip spam detection if disabled in settings
    if (!settings.spam_detection_enabled) {
        return null
    }

    const isSpam = checkUserSpam(state, senderUserId, contentHash, now, settings)

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

    // Use settings from DB with fallbacks to env vars
    const timeoutSecs = settings.timeout_seconds ?? TIMEOUT_SECONDS
    const banOnRepeatCount = settings.ban_on_repeat_count ?? BAN_ON_REPEAT_COUNT
    const spamRepeatThreshold = settings.spam_repeat_threshold ?? SPAM_REPEAT_THRESHOLD

    let action: ModerationAction | null = null

    if (offense.count >= banOnRepeatCount) {
        action = {
            type: 'ban',
            reason: `Repeat spam offender (${offense.count} offenses)`,
            rule_id: 'repeat_offender',
            raid_mode_active: raidModeActive,
        }
    } else if (offense.repeat_count >= spamRepeatThreshold) {
        action = {
            type: 'timeout',
            duration_seconds: timeoutSecs,
            reason: `Repeated identical messages (${offense.repeat_count}x)`,
            rule_id: 'repeated_message',
            raid_mode_active: raidModeActive,
        }
    } else if (isSpam || raidModeActive) {
        action = {
            type: 'timeout',
            duration_seconds: raidModeActive ? timeoutSecs * 2 : timeoutSecs,
            reason: raidModeActive
                ? `Spam detected during raid mode`
                : `Spam detected (${state.messageWindow.filter(m => m.sender_user_id === senderUserId && m.timestamp > now - 10000).length} msgs in 10s)`,
            rule_id: raidModeActive ? 'raid_spam' : 'spam',
            raid_mode_active: raidModeActive,
        }
    }

    if (action) {
        recordModerationAction(state, broadcasterUserId, senderUserId, now)
        console.log(`[moderation-worker] ${action.type.toUpperCase()} user ${payload.sender.username} (${senderUserId}): ${action.reason}`)
    }

    return action
}

async function acquireAdvisoryLock(): Promise<boolean> {
    try {
        const result = await (db as any).$queryRaw<Array<{ pg_try_advisory_lock: boolean }>>`
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
        await (db as any).$queryRaw`SELECT pg_advisory_unlock(${ADVISORY_LOCK_ID})`
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
        const broadcaster = await (db as any).user.findFirst({
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

        // Load settings once per job (used by both moderation and replies)
        const settings = await getModeratorBotSettingsFromDb()

        // Moderation check
        const moderationAction = await evaluateMessageForModeration(payload, settings)
        if (moderationAction) {
            let actionSuccess = false
            let actionError: string | undefined

            try {
                // Check dry run mode from settings
                const isDryRun = settings.dry_run_mode || DRY_RUN

                if (isDryRun) {
                    // Dry run - just log, don't execute
                    actionSuccess = true
                    console.log(`[moderation-worker] [DRY RUN] Would ${moderationAction.type.toUpperCase()} user ${payload.sender.username} (${moderationAction.reason})`)
                } else {
                    const banResult = await moderationBan({
                        broadcaster_user_id: broadcasterUserId,
                        user_id: senderUserId,
                        duration_seconds: moderationAction.duration_seconds,
                        reason: moderationAction.reason,
                    })

                    if (banResult.success) {
                        actionSuccess = true
                        moderationActionsCount++

                        // Send chat message announcing the action (if enabled)
                        if (settings.moderation_announce_actions) {
                            const actionText = moderationAction.type === 'ban'
                                ? 'banned'
                                : `timed out for ${Math.floor((moderationAction.duration_seconds || 0) / 60)} minutes`

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
                        actionError = banResult.error || 'Unknown error'
                        console.warn(`[moderation-worker] ⚠️ Moderation action failed: ${banResult.error}`)
                    }
                }
            } catch (modError) {
                actionError = modError instanceof Error ? modError.message : 'Unknown error'
                console.warn(`[moderation-worker] ⚠️ Error executing moderation action:`, actionError)
            }

            // Log the moderation action to database
            await logModerationAction({
                broadcaster_user_id: broadcasterUserId,
                target_user_id: senderUserId,
                target_username: payload.sender.username,
                action_type: moderationAction.type,
                duration_seconds: moderationAction.duration_seconds,
                reason: moderationAction.reason,
                rule_id: moderationAction.rule_id,
                ai_flagged: moderationAction.rule_id === 'ai_moderation',
                ai_categories: moderationAction.ai_categories,
                ai_max_score: moderationAction.ai_max_score,
                message_content: payload.content?.substring(0, 500),
                message_id: payload.message_id,
                raid_mode_active: moderationAction.raid_mode_active,
                dry_run: settings.dry_run_mode || DRY_RUN,
                success: actionSuccess,
                error_message: actionError,
            }).catch(err => {
                console.warn(`[moderation-worker] ⚠️ Failed to log moderation action:`, err instanceof Error ? err.message : 'Unknown')
            })
        }

        // Bot reply check (works regardless of stream status - online or offline)
        try {
            const replyEnabled = FORCE_BOT_REPLIES ? true : settings.bot_reply_enabled
            const replyCooldownMs = FORCE_BOT_REPLIES ? FORCE_BOT_REPLIES_COOLDOWN_MS : settings.bot_reply_cooldown_ms
            const aiReplyEnabled = FORCE_BOT_REPLIES ? true : settings.ai_reply_enabled
            // Use settings from DB for mention/ask requirements
            const requireMention = settings.bot_reply_require_mention ?? BOT_REPLY_REQUIRE_MENTION
            const requireAsk = settings.bot_reply_require_ask ?? BOT_REPLY_REQUIRE_ASK

            if (!replyEnabled) {
                if (VERBOSE_LOGS) {
                    console.log(`[moderation-worker] 💬 Bot replies disabled (bot_reply_enabled=false)`)
                }
            } else if (isExemptFromReplies(payload)) {
                if (VERBOSE_LOGS) {
                    console.log(`[moderation-worker] 💬 Skipping reply - user is exempt: ${payload.sender.username}`)
                }
            } else if (
                requireMention &&
                (() => {
                    const mentioned = isBotMentioned(payload.content, MODERATOR_USERNAME)
                    const asked = looksLikeRequestOrQuestion(payload.content)
                    const greeted = looksLikeGreeting(payload.content)
                    return !mentioned || (requireAsk && !asked && !greeted)
                })()
            ) {
                if (VERBOSE_LOGS) {
                    const mentioned = isBotMentioned(payload.content, MODERATOR_USERNAME)
                    const asked = looksLikeRequestOrQuestion(payload.content)
                    const greeted = looksLikeGreeting(payload.content)
                    console.log(`[moderation-worker] 💬 Skipping reply - require mention${requireAsk ? '+(ask|greeting)' : ''} (mentioned=${mentioned}, asked=${asked}, greeted=${greeted})`)
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
                    // Check reply probability
                    const replyProbability = settings.bot_reply_probability ?? 1
                    if (replyProbability < 1 && Math.random() > replyProbability) {
                        if (VERBOSE_LOGS) {
                            console.log(`[moderation-worker] 💬 Skipping reply due to probability (${(replyProbability * 100).toFixed(0)}%)`)
                        }
                    } else {
                    // Generate reply using AI if enabled, otherwise simple fallback
                    let replyText: string | null = null
                    let replyType: 'ai' | 'simple' | 'quick_response' = 'simple'
                    const replyStartTime = Date.now()

                    // Mention-only pings should always get a quick response.
                    if (isBotMentioned(payload.content, MODERATOR_USERNAME) && isOnlyBotMention(payload.content, MODERATOR_USERNAME)) {
                        replyText = pickOne(['yo?', 'sup?', 'yeah?', 'what you need?', "what's good?"])
                        replyType = 'quick_response'
                    } else {
                        const chatSettings = {
                            model: settings.ai_chat_model || 'gpt-4o-mini',
                            temperature: settings.ai_chat_temperature ?? 0.9,
                            maxTokens: settings.ai_chat_max_tokens ?? 140,
                        }
                        replyText = await generateBotReply(
                            payload.content,
                            payload.sender.username,
                            aiReplyEnabled,
                            chatSettings
                        )
                        replyType = aiReplyEnabled ? 'ai' : 'simple'
                    }

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

                        const latencyMs = Date.now() - replyStartTime

                        if (replyResult.success) {
                            botRepliesCount++
                            botReplyCooldowns.set(broadcasterKey, now)
                            console.log(`[moderation-worker] 💬 Bot replied (${replyType}): ${replyText.substring(0, 50)}...`)

                            // Log the successful reply
                            await logBotReply({
                                broadcaster_user_id: broadcasterUserId,
                                trigger_user_id: senderUserId,
                                trigger_username: payload.sender.username,
                                trigger_message: payload.content?.substring(0, 500) || '',
                                reply_content: replyText,
                                reply_type: replyType,
                                ai_model: replyType === 'ai' ? (settings.ai_chat_model || 'gpt-4o-mini') : undefined,
                                success: true,
                                latency_ms: latencyMs,
                            }).catch(() => {
                                // Non-critical
                            })
                        } else {
                            console.warn(`[moderation-worker] ⚠️ Bot reply failed: ${replyResult.error}`)

                            // Log the failed reply
                            await logBotReply({
                                broadcaster_user_id: broadcasterUserId,
                                trigger_user_id: senderUserId,
                                trigger_username: payload.sender.username,
                                trigger_message: payload.content?.substring(0, 500) || '',
                                reply_content: replyText,
                                reply_type: replyType,
                                success: false,
                                error_message: replyResult.error,
                                latency_ms: latencyMs,
                            }).catch(() => {
                                // Non-critical
                            })
                        }
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
