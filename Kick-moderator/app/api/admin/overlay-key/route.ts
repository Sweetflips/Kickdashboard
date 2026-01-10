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

    // Build example URLs using *public* origin (important behind proxies like Railway/Cloudflare)
    // Prefer forwarded headers so we don't emit internal hosts (e.g. 0.0.0.0:8080).
    const url = new URL(request.url)
    const headers = request.headers
    const forwardedProto = headers.get('x-forwarded-proto')
    const forwardedHost = headers.get('x-forwarded-host')
    const host = forwardedHost || headers.get('host') || url.host
    const proto = forwardedProto || url.protocol.replace(':', '') || 'https'
    const baseUrl = `${proto}://${host}`

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
