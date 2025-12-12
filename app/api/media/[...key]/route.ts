import { NextResponse } from 'next/server'
import { getFromR2 } from '@/lib/r2'
import { getMediaCdnBaseUrl, signCdnPath } from '@/lib/media-url'

export const dynamic = 'force-dynamic'

/**
 * Media serving endpoint with anti-hotlink protection
 * GET /api/media/avatars/123/1234567890_abc.webp
 */
export async function GET(
  request: Request,
  { params }: { params: { key: string[] } }
) {
  try {
    const key = params.key.join('/')

    if (!key) {
      return NextResponse.json(
        { error: 'Media key is required' },
        { status: 400 }
      )
    }

    // Anti-hotlink protection: check Origin/Referer
    const origin = request.headers.get('origin')
    const referer = request.headers.get('referer')
    const host = request.headers.get('host')

    // Get allowed domains from env or use current host
    const allowedDomains = process.env.ALLOWED_MEDIA_DOMAINS?.split(',').map(d => d.trim()) || []

    // Build list of allowed origins
    const allowedOrigins: string[] = []

    // Add current domain
    if (host) {
      allowedOrigins.push(`https://${host}`)
      allowedOrigins.push(`http://${host}`)
    }

    // Add domains from env
    allowedOrigins.push(...allowedDomains)

    // Add localhost variants for development
    if (process.env.NODE_ENV === 'development') {
      allowedOrigins.push('http://localhost:3000', 'http://localhost:3001', 'http://127.0.0.1:3000')
    }

    // Check if request is allowed:
    // 1. No Origin header = same-origin request (allowed)
    // 2. Origin matches allowed list
    // 3. Referer matches allowed domain
    const isAllowed =
      !origin || // Same-origin request (no Origin header)
      allowedOrigins.some(allowed => origin === allowed || origin.startsWith(allowed)) ||
      (referer && allowedOrigins.some(allowed => referer.startsWith(allowed)))

    if (!isAllowed) {
      return NextResponse.json(
        { error: 'Forbidden: Hotlinking not allowed' },
        { status: 403 }
      )
    }

    // If a CDN base is configured, redirect to a short-lived signed CDN URL.
    // The CDN (Cloudflare Worker) enforces signature and serves bytes from private R2.
    const cdnBase = getMediaCdnBaseUrl()
    const signingSecret = process.env.MEDIA_CDN_SIGNING_SECRET || ''
    if (cdnBase && signingSecret) {
      const isVersioned = /\/\d+_[a-zA-Z0-9]+\./.test(key)
      const exp = Math.floor(Date.now() / 1000) + (isVersioned ? 86400 : 900) // 24h for versioned, 15m otherwise
      const sig = await signCdnPath(key, exp, signingSecret)
      const cdnUrl = `${cdnBase.replace(/\/+$/, '')}/${key.replace(/^\/+/, '')}?exp=${exp}&sig=${sig}`
      return NextResponse.redirect(cdnUrl, {
        status: 302,
        headers: {
          // Cache redirect briefly (the signed URL itself is short-lived)
          'Cache-Control': isVersioned ? 'public, max-age=300' : 'public, max-age=60',
        },
      })
    }

    // Fetch from R2
    const object = await getFromR2(key)

    // Determine cache control
    // Versioned keys (with timestamp) can be cached forever
    const isVersioned = /\/\d+_[a-zA-Z0-9]+\./.test(key)
    const cacheControl = isVersioned
      ? 'public, max-age=31536000, immutable'
      : 'public, max-age=3600'

    // Convert Buffer to ArrayBuffer slice for NextResponse BodyInit compatibility
    const body = object.body.buffer.slice(object.body.byteOffset, object.body.byteOffset + object.body.byteLength) as ArrayBuffer

    return new NextResponse(body, {
      headers: {
        'Content-Type': object.contentType || 'application/octet-stream',
        'Cache-Control': cacheControl,
        ...(object.etag && { 'ETag': object.etag }),
        ...(object.contentLength && { 'Content-Length': object.contentLength.toString() }),
      },
    })
  } catch (error: any) {
    console.error(`❌ [MEDIA] Failed to serve media: ${error.message}`)

    if (error.message?.includes('not found') || error.message?.includes('NotFound')) {
      return NextResponse.json(
        { error: 'Media not found' },
        { status: 404 }
      )
    }

    return NextResponse.json(
      { error: 'Failed to serve media', details: error.message },
      { status: 500 }
    )
  }
}
