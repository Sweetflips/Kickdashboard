import { db } from './db'

export const MODERATOR_BOT_SETTINGS_KEY = 'moderator_bot_settings_v2'

export interface ModeratorBotSettings {
  // === AI MODERATION ===
  ai_moderation_enabled: boolean
  ai_action: 'timeout' | 'ban'
  ai_moderation_model: string
  ai_moderation_score_threshold: number // 0..1
  ai_moderation_timeout_seconds: number
  ai_moderation_cache_ttl_ms: number
  moderation_announce_actions: boolean

  // === SPAM/RAID DETECTION ===
  spam_detection_enabled: boolean
  raid_mode_trigger_msgs_5s: number
  raid_mode_trigger_unique_5s: number
  raid_mode_duration_ms: number
  spam_per_user_msgs_10s: number
  spam_repeat_threshold: number
  timeout_seconds: number
  ban_on_repeat_count: number
  moderation_cooldown_ms: number

  // === BOT REPLIES ===
  bot_reply_enabled: boolean
  bot_reply_probability: number // 0..1
  bot_reply_cooldown_ms: number
  bot_reply_require_mention: boolean
  bot_reply_require_ask: boolean

  // === AI REPLIES ===
  ai_reply_enabled: boolean
  ai_chat_model: string
  ai_chat_temperature: number // 0..2
  ai_chat_max_tokens: number

  // === SLOT CALLS ===
  bot_slot_call_enabled: boolean
  bot_slot_call_probability: number // 0..1
  bot_slot_call_min_interval_ms: number
  bot_slot_call_message: string

  // === ALLOWLIST ===
  moderation_allowlist: string[] // usernames exempt from moderation

  // === DRY RUN MODE ===
  dry_run_mode: boolean
}

export function getDefaultModeratorBotSettings(): ModeratorBotSettings {
  return {
    // AI Moderation
    ai_moderation_enabled: process.env.OPENAI_MODERATION_ENABLED === 'true',
    ai_action: (process.env.OPENAI_MODERATION_ACTION === 'ban' ? 'ban' : 'timeout'),
    ai_moderation_model: process.env.OPENAI_MODERATION_MODEL || 'omni-moderation-latest',
    ai_moderation_score_threshold: clamp01(parseFloat(process.env.OPENAI_MODERATION_SCORE_THRESHOLD || '0.85')),
    ai_moderation_timeout_seconds: parseInt(process.env.OPENAI_MODERATION_TIMEOUT_SECONDS || '600', 10),
    ai_moderation_cache_ttl_ms: parseInt(process.env.OPENAI_MODERATION_CACHE_TTL_MS || '120000', 10),
    moderation_announce_actions: process.env.MODERATION_ANNOUNCE_ACTIONS === 'true',

    // Spam/Raid Detection
    spam_detection_enabled: process.env.KICK_MODERATION_ENABLED !== 'false',
    raid_mode_trigger_msgs_5s: parseInt(process.env.KICK_RAIDMODE_TRIGGER_MSGS_5S || '80', 10),
    raid_mode_trigger_unique_5s: parseInt(process.env.KICK_RAIDMODE_TRIGGER_UNIQUE_5S || '40', 10),
    raid_mode_duration_ms: parseInt(process.env.KICK_RAIDMODE_DURATION_MS || '300000', 10),
    spam_per_user_msgs_10s: parseInt(process.env.KICK_SPAM_PER_USER_MSGS_10S || '6', 10),
    spam_repeat_threshold: parseInt(process.env.KICK_SPAM_REPEAT_THRESHOLD || '3', 10),
    timeout_seconds: parseInt(process.env.KICK_TIMEOUT_SECONDS || '600', 10),
    ban_on_repeat_count: parseInt(process.env.KICK_BAN_ON_REPEAT_COUNT || '3', 10),
    moderation_cooldown_ms: parseInt(process.env.KICK_MODERATION_COOLDOWN_MS || '60000', 10),

    // Bot Replies
    bot_reply_enabled: process.env.BOT_REPLY_ENABLED === 'true',
    bot_reply_probability: clamp01(parseFloat(process.env.BOT_REPLY_PROBABILITY || '1')),
    bot_reply_cooldown_ms: parseInt(process.env.BOT_REPLY_COOLDOWN_MS || '20000', 10),
    bot_reply_require_mention: process.env.BOT_REPLY_REQUIRE_MENTION !== 'false',
    bot_reply_require_ask: process.env.BOT_REPLY_REQUIRE_ASK === 'true',

    // AI Replies
    ai_reply_enabled: process.env.OPENAI_CHAT_ENABLED === 'true',
    ai_chat_model: process.env.OPENAI_CHAT_MODEL || 'gpt-4o-mini',
    ai_chat_temperature: clamp(parseFloat(process.env.OPENAI_CHAT_TEMPERATURE || '0.9'), 0, 2),
    ai_chat_max_tokens: parseInt(process.env.OPENAI_CHAT_MAX_TOKENS || '140', 10),

    // Slot Calls
    bot_slot_call_enabled: process.env.BOT_SLOT_CALL_ENABLED === 'true',
    bot_slot_call_probability: clamp01(parseFloat(process.env.BOT_SLOT_CALL_PROBABILITY || '0.03')),
    bot_slot_call_min_interval_ms: parseInt(process.env.BOT_SLOT_CALL_MIN_INTERVAL_MS || '900000', 10),
    bot_slot_call_message: process.env.BOT_SLOT_CALL_MESSAGE || '!slots',

    // Allowlist
    moderation_allowlist: (process.env.KICK_MODERATION_ALLOWLIST || '').split(',').map(u => u.trim().toLowerCase()).filter(Boolean),

    // Dry Run
    dry_run_mode: process.env.KICK_MODERATION_DRY_RUN === '1',
  }
}

function clamp01(n: number): number {
  if (!isFinite(n)) return 0
  return Math.max(0, Math.min(1, n))
}

function clamp(n: number, min: number, max: number): number {
  if (!isFinite(n)) return min
  return Math.max(min, Math.min(max, n))
}

export function normalizeModeratorBotSettings(input: Partial<ModeratorBotSettings>): ModeratorBotSettings {
  const base = getDefaultModeratorBotSettings()

  const out: ModeratorBotSettings = {
    ...base,
    ...input,
  }

  // Booleans
  out.ai_moderation_enabled = Boolean(out.ai_moderation_enabled)
  out.moderation_announce_actions = Boolean(out.moderation_announce_actions)
  out.spam_detection_enabled = Boolean(out.spam_detection_enabled)
  out.bot_reply_enabled = Boolean(out.bot_reply_enabled)
  out.bot_reply_require_mention = Boolean(out.bot_reply_require_mention)
  out.bot_reply_require_ask = Boolean(out.bot_reply_require_ask)
  out.ai_reply_enabled = Boolean(out.ai_reply_enabled)
  out.bot_slot_call_enabled = Boolean(out.bot_slot_call_enabled)
  out.dry_run_mode = Boolean(out.dry_run_mode)

  // Clamp probabilities
  out.bot_reply_probability = clamp01(Number(out.bot_reply_probability))
  out.bot_slot_call_probability = clamp01(Number(out.bot_slot_call_probability))
  out.ai_moderation_score_threshold = clamp01(Number(out.ai_moderation_score_threshold))
  out.ai_chat_temperature = clamp(Number(out.ai_chat_temperature), 0, 2)

  // Positive integers
  out.ai_moderation_timeout_seconds = Math.max(60, Math.trunc(Number(out.ai_moderation_timeout_seconds) || base.ai_moderation_timeout_seconds))
  out.ai_moderation_cache_ttl_ms = Math.max(0, Math.trunc(Number(out.ai_moderation_cache_ttl_ms) || base.ai_moderation_cache_ttl_ms))
  out.raid_mode_trigger_msgs_5s = Math.max(1, Math.trunc(Number(out.raid_mode_trigger_msgs_5s) || base.raid_mode_trigger_msgs_5s))
  out.raid_mode_trigger_unique_5s = Math.max(1, Math.trunc(Number(out.raid_mode_trigger_unique_5s) || base.raid_mode_trigger_unique_5s))
  out.raid_mode_duration_ms = Math.max(0, Math.trunc(Number(out.raid_mode_duration_ms) || base.raid_mode_duration_ms))
  out.spam_per_user_msgs_10s = Math.max(1, Math.trunc(Number(out.spam_per_user_msgs_10s) || base.spam_per_user_msgs_10s))
  out.spam_repeat_threshold = Math.max(1, Math.trunc(Number(out.spam_repeat_threshold) || base.spam_repeat_threshold))
  out.timeout_seconds = Math.max(60, Math.trunc(Number(out.timeout_seconds) || base.timeout_seconds))
  out.ban_on_repeat_count = Math.max(1, Math.trunc(Number(out.ban_on_repeat_count) || base.ban_on_repeat_count))
  out.moderation_cooldown_ms = Math.max(0, Math.trunc(Number(out.moderation_cooldown_ms) || base.moderation_cooldown_ms))
  out.bot_reply_cooldown_ms = Math.max(0, Math.trunc(Number(out.bot_reply_cooldown_ms) || base.bot_reply_cooldown_ms))
  out.ai_chat_max_tokens = Math.max(16, Math.min(256, Math.trunc(Number(out.ai_chat_max_tokens) || base.ai_chat_max_tokens)))
  out.bot_slot_call_min_interval_ms = Math.max(0, Math.trunc(Number(out.bot_slot_call_min_interval_ms) || base.bot_slot_call_min_interval_ms))

  // Strings
  out.ai_action = out.ai_action === 'ban' ? 'ban' : 'timeout'
  out.ai_moderation_model = String(out.ai_moderation_model || '').trim() || base.ai_moderation_model
  out.ai_chat_model = String(out.ai_chat_model || '').trim() || base.ai_chat_model
  const msg = String(out.bot_slot_call_message || '').trim()
  out.bot_slot_call_message = msg.length ? msg.slice(0, 200) : base.bot_slot_call_message

  // Allowlist
  if (Array.isArray(out.moderation_allowlist)) {
    out.moderation_allowlist = out.moderation_allowlist
      .map(u => String(u || '').trim().toLowerCase())
      .filter(Boolean)
      .slice(0, 100)
  } else if (typeof out.moderation_allowlist === 'string') {
    out.moderation_allowlist = (out.moderation_allowlist as string)
      .split(',')
      .map(u => u.trim().toLowerCase())
      .filter(Boolean)
      .slice(0, 100)
  } else {
    out.moderation_allowlist = base.moderation_allowlist
  }

  return out
}

export async function getModeratorBotSettingsFromDb(): Promise<ModeratorBotSettings> {
  const base = getDefaultModeratorBotSettings()
  try {
    // Try v2 first, then fall back to v1 for migration
    let row = await db.appSetting.findUnique({
      where: { key: MODERATOR_BOT_SETTINGS_KEY },
      select: { value: true },
    })

    if (!row?.value) {
      // Try legacy v1 key
      row = await db.appSetting.findUnique({
        where: { key: 'moderator_bot_settings_v1' },
        select: { value: true },
      })
    }

    if (!row?.value) return base
    const parsed = JSON.parse(row.value)
    return normalizeModeratorBotSettings(parsed)
  } catch {
    return base
  }
}

export async function setModeratorBotSettingsInDb(settings: ModeratorBotSettings): Promise<void> {
  await db.appSetting.upsert({
    where: { key: MODERATOR_BOT_SETTINGS_KEY },
    update: { value: JSON.stringify(settings) },
    create: { key: MODERATOR_BOT_SETTINGS_KEY, value: JSON.stringify(settings) },
  })
}

// Helper to log moderation actions
export async function logModerationAction(data: {
  broadcaster_user_id: bigint
  target_user_id: bigint
  target_username: string
  action_type: 'timeout' | 'ban' | 'unban' | 'delete_message'
  duration_seconds?: number
  reason?: string
  rule_id?: string
  ai_flagged?: boolean
  ai_categories?: Record<string, boolean> | null
  ai_max_score?: number
  message_content?: string
  message_id?: string
  raid_mode_active?: boolean
  dry_run?: boolean
  success?: boolean
  error_message?: string
}): Promise<void> {
  try {
    await db.moderationActionLog.create({
      data: {
        broadcaster_user_id: data.broadcaster_user_id,
        target_user_id: data.target_user_id,
        target_username: data.target_username,
        action_type: data.action_type,
        duration_seconds: data.duration_seconds,
        reason: data.reason,
        rule_id: data.rule_id,
        ai_flagged: data.ai_flagged ?? false,
        ai_categories: data.ai_categories ?? undefined,
        ai_max_score: data.ai_max_score,
        message_content: data.message_content,
        message_id: data.message_id,
        raid_mode_active: data.raid_mode_active ?? false,
        dry_run: data.dry_run ?? false,
        success: data.success ?? true,
        error_message: data.error_message,
      },
    })
  } catch (err) {
    console.error('[moderation-settings] Failed to log moderation action:', err)
  }
}

// Helper to log bot replies
export async function logBotReply(data: {
  broadcaster_user_id: bigint
  trigger_user_id: bigint
  trigger_username: string
  trigger_message: string
  reply_content: string
  reply_type: 'ai' | 'simple' | 'quick_response'
  ai_model?: string
  success?: boolean
  error_message?: string
  latency_ms?: number
}): Promise<void> {
  try {
    await db.botReplyLog.create({
      data: {
        broadcaster_user_id: data.broadcaster_user_id,
        trigger_user_id: data.trigger_user_id,
        trigger_username: data.trigger_username,
        trigger_message: data.trigger_message,
        reply_content: data.reply_content,
        reply_type: data.reply_type,
        ai_model: data.ai_model,
        success: data.success ?? true,
        error_message: data.error_message,
        latency_ms: data.latency_ms,
      },
    })
  } catch (err) {
    console.error('[moderation-settings] Failed to log bot reply:', err)
  }
}
