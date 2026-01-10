import { db } from './db'

export const MODERATOR_BOT_SETTINGS_KEY = 'moderator_bot_settings_v2'

export interface ModeratorBotSettings {
  ai_moderation_enabled: boolean
  ai_reply_enabled: boolean
  ai_action: 'timeout' | 'ban'

  bot_reply_enabled: boolean
  bot_reply_probability: number // 0..1
  bot_reply_cooldown_ms: number

  bot_slot_call_enabled: boolean
  bot_slot_call_probability: number // 0..1 (per loop tick)
  bot_slot_call_min_interval_ms: number
  bot_slot_call_message: string

  moderation_announce_actions: boolean

  // Dry run mode - when true, moderation actions are logged but not executed
  dry_run_mode: boolean
}

export function getDefaultModeratorBotSettings(): ModeratorBotSettings {
  return {
    ai_moderation_enabled: process.env.OPENAI_MODERATION_ENABLED === 'true',
    ai_reply_enabled: process.env.OPENAI_CHAT_ENABLED === 'true',
    ai_action: (process.env.OPENAI_MODERATION_ACTION === 'ban' ? 'ban' : 'timeout'),

    bot_reply_enabled: process.env.BOT_REPLY_ENABLED === 'true',
    bot_reply_probability: clamp01(parseFloat(process.env.BOT_REPLY_PROBABILITY || '0.35')),
    bot_reply_cooldown_ms: parseInt(process.env.BOT_REPLY_COOLDOWN_MS || '20000', 10),

    bot_slot_call_enabled: process.env.BOT_SLOT_CALL_ENABLED === 'true',
    bot_slot_call_probability: clamp01(parseFloat(process.env.BOT_SLOT_CALL_PROBABILITY || '0.03')),
    bot_slot_call_min_interval_ms: parseInt(process.env.BOT_SLOT_CALL_MIN_INTERVAL_MS || '900000', 10),
    // Default without emoji to avoid encoding issues in some clients/logs
    bot_slot_call_message: process.env.BOT_SLOT_CALL_MESSAGE || '!slots',

    moderation_announce_actions: process.env.MODERATION_ANNOUNCE_ACTIONS === 'true',

    // Dry run mode defaults to false unless env var is explicitly set
    dry_run_mode: process.env.KICK_MODERATION_DRY_RUN === '1',
  }
}

function clamp01(n: number): number {
  if (!isFinite(n)) return 0
  return Math.max(0, Math.min(1, n))
}

export function normalizeModeratorBotSettings(input: Partial<ModeratorBotSettings>): ModeratorBotSettings {
  const base = getDefaultModeratorBotSettings()

  const out: ModeratorBotSettings = {
    ...base,
    ...input,
  }

  out.bot_reply_probability = clamp01(Number(out.bot_reply_probability))
  out.bot_slot_call_probability = clamp01(Number(out.bot_slot_call_probability))

  out.bot_reply_cooldown_ms = Math.max(0, Number(out.bot_reply_cooldown_ms) || base.bot_reply_cooldown_ms)
  out.bot_slot_call_min_interval_ms = Math.max(0, Number(out.bot_slot_call_min_interval_ms) || base.bot_slot_call_min_interval_ms)

  const msg = String(out.bot_slot_call_message || '').trim()
  out.bot_slot_call_message = msg.length ? msg.slice(0, 200) : base.bot_slot_call_message

  out.ai_action = out.ai_action === 'ban' ? 'ban' : 'timeout'

  out.ai_moderation_enabled = Boolean(out.ai_moderation_enabled)
  out.ai_reply_enabled = Boolean(out.ai_reply_enabled)
  out.bot_reply_enabled = Boolean(out.bot_reply_enabled)
  out.bot_slot_call_enabled = Boolean(out.bot_slot_call_enabled)
  out.moderation_announce_actions = Boolean(out.moderation_announce_actions)
  out.dry_run_mode = Boolean(out.dry_run_mode)

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
