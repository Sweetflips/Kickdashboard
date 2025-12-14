import { NextResponse } from 'next/server'
import { isAdmin } from '@/lib/auth'
import { getOverlayAccessKey } from '@/lib/overlay-access-key'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const adminCheck = await isAdmin(request)
    if (!adminCheck) {
      return NextResponse.json({ error: 'Unauthorized - Admin access required' }, { status: 403 })
    }

    const key = await getOverlayAccessKey()

    // Build example URLs (we'll need the base URL from request)
    const url = new URL(request.url)
    const baseUrl = `${url.protocol}//${url.host}`

    return NextResponse.json({
      success: true,
      key,
      overlayExamples: {
        raffleOverlayUrlTemplate: `${baseUrl}/raffles/{raffleId}/wheel?overlay=1&key=${key}`,
        globalOverlayUrlTemplate: `${baseUrl}/wheel?key=${key}`,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
