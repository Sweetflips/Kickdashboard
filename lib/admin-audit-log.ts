import { db } from './db'

export const ADMIN_AUDIT_LOG_KEY = 'admin_audit_log_v1'

export type AdminAuditLogEntry = {
  ts: number
  actor_username?: string
  actor_kick_user_id?: string
  action: string
  target: string
  summary?: string
}

function safeParseArray(s: string): any[] {
  try {
    const parsed = JSON.parse(s)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export async function appendAdminAuditLog(entry: AdminAuditLogEntry, maxEntries = 200): Promise<void> {
  const safeEntry: AdminAuditLogEntry = {
    ts: typeof entry.ts === 'number' ? entry.ts : Date.now(),
    actor_username: entry.actor_username ? String(entry.actor_username).slice(0, 64) : undefined,
    actor_kick_user_id: entry.actor_kick_user_id ? String(entry.actor_kick_user_id).slice(0, 32) : undefined,
    action: String(entry.action || 'unknown').slice(0, 64),
    target: String(entry.target || 'unknown').slice(0, 64),
    summary: entry.summary ? String(entry.summary).slice(0, 300) : undefined,
  }

  // Read-modify-write is okay here: low volume admin writes.
  const existing = await db.appSetting.findUnique({
    where: { key: ADMIN_AUDIT_LOG_KEY },
    select: { value: true },
  })

  const arr = existing?.value ? safeParseArray(existing.value) : []
  arr.unshift(safeEntry)
  if (arr.length > maxEntries) arr.length = maxEntries

  await db.appSetting.upsert({
    where: { key: ADMIN_AUDIT_LOG_KEY },
    update: { value: JSON.stringify(arr) },
    create: { key: ADMIN_AUDIT_LOG_KEY, value: JSON.stringify(arr) },
  })
}

export async function getAdminAuditLog(limit = 100): Promise<AdminAuditLogEntry[]> {
  const row = await db.appSetting.findUnique({
    where: { key: ADMIN_AUDIT_LOG_KEY },
    select: { value: true },
  })
  if (!row?.value) return []
  const arr = safeParseArray(row.value)
  return arr.slice(0, Math.max(1, Math.min(500, Math.trunc(Number(limit) || 100)))) as AdminAuditLogEntry[]
}

export async function clearAdminAuditLog(): Promise<void> {
  await db.appSetting.upsert({
    where: { key: ADMIN_AUDIT_LOG_KEY },
    update: { value: JSON.stringify([]) },
    create: { key: ADMIN_AUDIT_LOG_KEY, value: JSON.stringify([]) },
  })
}


