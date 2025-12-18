import { NextResponse } from 'next/server'
import { isAdmin, getAuthenticatedUser } from '@/lib/auth'
import { clearAdminAuditLog, getAdminAuditLog } from '@/lib/admin-audit-log'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const adminCheck = await isAdmin(request)
  if (!adminCheck) {
    return NextResponse.json({ error: 'Unauthorized - Admin access required' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const limit = searchParams.get('limit')
  const entries = await getAdminAuditLog(limit ? Number(limit) : 100)
  return NextResponse.json({ entries })
}

export async function DELETE(request: Request) {
  const adminCheck = await isAdmin(request)
  if (!adminCheck) {
    return NextResponse.json({ error: 'Unauthorized - Admin access required' }, { status: 403 })
  }

  // Optional: only allow clearing if caller is authenticated (extra sanity)
  const auth = await getAuthenticatedUser(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  await clearAdminAuditLog()
  return NextResponse.json({ ok: true })
}

