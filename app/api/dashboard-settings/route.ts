import { NextResponse } from 'next/server'
import { getDashboardSettingsFromDb } from '@/lib/dashboard-settings'

export const dynamic = 'force-dynamic'

export async function GET() {
  const settings = await getDashboardSettingsFromDb()
  return NextResponse.json({ settings })
}
