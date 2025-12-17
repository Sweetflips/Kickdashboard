import { db } from './db'

export const DASHBOARD_SETTINGS_KEY = 'dashboard_settings_v1'

export interface DashboardSettings {
  channel_slug: string
  channel_refresh_ms: number
  leaderboard_refresh_ms: number
  chat_height_px: number
  show_chat: boolean
  show_leaderboard: boolean
  show_redeem_code_button: boolean
  leaderboard_max_rows: number
}

function clampInt(n: number, min: number, max: number): number {
  const v = Number(n)
  if (!Number.isFinite(v)) return min
  return Math.max(min, Math.min(max, Math.trunc(v)))
}

export function getDefaultDashboardSettings(): DashboardSettings {
  return {
    channel_slug: (process.env.KICK_CHANNEL_SLUG || 'sweetflips').trim() || 'sweetflips',
    channel_refresh_ms: clampInt(process.env.DASHBOARD_CHANNEL_REFRESH_MS ? Number(process.env.DASHBOARD_CHANNEL_REFRESH_MS) : 60000, 5000, 300000),
    leaderboard_refresh_ms: clampInt(process.env.DASHBOARD_LEADERBOARD_REFRESH_MS ? Number(process.env.DASHBOARD_LEADERBOARD_REFRESH_MS) : 10000, 2500, 60000),
    chat_height_px: clampInt(process.env.DASHBOARD_CHAT_HEIGHT_PX ? Number(process.env.DASHBOARD_CHAT_HEIGHT_PX) : 600, 300, 1200),
    show_chat: String(process.env.DASHBOARD_SHOW_CHAT || 'true').toLowerCase() !== 'false',
    show_leaderboard: String(process.env.DASHBOARD_SHOW_LEADERBOARD || 'true').toLowerCase() !== 'false',
    show_redeem_code_button: String(process.env.DASHBOARD_SHOW_REDEEM_CODE_BUTTON || 'true').toLowerCase() !== 'false',
    leaderboard_max_rows: clampInt(process.env.DASHBOARD_LEADERBOARD_MAX_ROWS ? Number(process.env.DASHBOARD_LEADERBOARD_MAX_ROWS) : 50, 5, 200),
  }
}

export function normalizeDashboardSettings(input: Partial<DashboardSettings>): DashboardSettings {
  const base = getDefaultDashboardSettings()

  const out: DashboardSettings = {
    ...base,
    ...input,
  }

  out.channel_slug = String(out.channel_slug || base.channel_slug).trim().toLowerCase() || base.channel_slug
  out.channel_refresh_ms = clampInt(out.channel_refresh_ms, 5000, 300000)
  out.leaderboard_refresh_ms = clampInt(out.leaderboard_refresh_ms, 2500, 60000)
  out.chat_height_px = clampInt(out.chat_height_px, 300, 1200)
  out.leaderboard_max_rows = clampInt(out.leaderboard_max_rows, 5, 200)

  out.show_chat = Boolean(out.show_chat)
  out.show_leaderboard = Boolean(out.show_leaderboard)
  out.show_redeem_code_button = Boolean(out.show_redeem_code_button)

  return out
}

export async function getDashboardSettingsFromDb(): Promise<DashboardSettings> {
  const base = getDefaultDashboardSettings()
  try {
    const row = await db.appSetting.findUnique({
      where: { key: DASHBOARD_SETTINGS_KEY },
      select: { value: true },
    })
    if (!row?.value) return base
    const parsed = JSON.parse(row.value)
    return normalizeDashboardSettings(parsed)
  } catch {
    return base
  }
}

export async function setDashboardSettingsInDb(settings: DashboardSettings): Promise<void> {
  await db.appSetting.upsert({
    where: { key: DASHBOARD_SETTINGS_KEY },
    update: { value: JSON.stringify(settings) },
    create: { key: DASHBOARD_SETTINGS_KEY, value: JSON.stringify(settings) },
  })
}
