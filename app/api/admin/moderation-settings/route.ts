import { NextResponse } from 'next/server'
import { isAdmin } from '@/lib/auth'
import { getModeratorBotSettingsFromDb, normalizeModeratorBotSettings, setModeratorBotSettingsInDb } from '@/lib/moderation-settings'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const adminCheck = await isAdmin(request)
  if (!adminCheck) {
    return NextResponse.json({ error: 'Unauthorized - Admin access required' }, { status: 403 })
  }

  const settings = await getModeratorBotSettingsFromDb()
  return NextResponse.json({ settings })
}

export async function POST(request: Request) {
  const adminCheck = await isAdmin(request)
  if (!adminCheck) {
    return NextResponse.json({ error: 'Unauthorized - Admin access required' }, { status: 403 })
  }

  try {
    const body = await request.json()
    const settings = normalizeModeratorBotSettings(body?.settings || {})
    await setModeratorBotSettingsInDb(settings)
    return NextResponse.json({ ok: true, settings })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: 'Failed to save settings', details: msg }, { status: 400 })
  }
}
