import { NextResponse } from 'next/server'
import { getAuthenticatedUser, isAdmin } from '@/lib/auth'
import { getDashboardSettingsFromDb, normalizeDashboardSettings, setDashboardSettingsInDb } from '@/lib/dashboard-settings'
import { appendAdminAuditLog } from '@/lib/admin-audit-log'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const adminCheck = await isAdmin(request)
  if (!adminCheck) {
    return NextResponse.json({ error: 'Unauthorized - Admin access required' }, { status: 403 })
  }

  const settings = await getDashboardSettingsFromDb()
  return NextResponse.json({ settings })
}

export async function POST(request: Request) {
  const adminCheck = await isAdmin(request)
  if (!adminCheck) {
    return NextResponse.json({ error: 'Unauthorized - Admin access required' }, { status: 403 })
  }

  try {
    const before = await getDashboardSettingsFromDb()
    const body = await request.json()
    const settings = normalizeDashboardSettings(body?.settings || {})
    await setDashboardSettingsInDb(settings)

    const auth = await getAuthenticatedUser(request)
    const prisma = db as any
    const actor = auth
      ? await prisma.user.findUnique({ where: { kick_user_id: auth.kickUserId }, select: { username: true, kick_user_id: true } })
      : null

    // Small, human-readable summary for the audit log
    const changed: string[] = []
    for (const k of Object.keys(settings) as Array<keyof typeof settings>) {
      if (JSON.stringify((before as any)[k]) !== JSON.stringify((settings as any)[k])) changed.push(String(k))
    }
    await appendAdminAuditLog({
      ts: Date.now(),
      actor_username: actor?.username || undefined,
      actor_kick_user_id: actor?.kick_user_id ? String(actor.kick_user_id) : undefined,
      action: 'update',
      target: 'dashboard_settings',
      summary: changed.length ? `Changed: ${changed.slice(0, 12).join(', ')}` : 'Saved (no diff detected)',
    })

    return NextResponse.json({ ok: true, settings })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: 'Failed to save settings', details: msg }, { status: 400 })
  }
}
