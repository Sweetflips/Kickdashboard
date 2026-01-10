import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const hostname = request.headers.get('host') || ''
  const url = request.nextUrl.clone()

  // Force canonical host: redirect kickdashboard.com (apex) to www.kickdashboard.com
  // This prevents auth loss when users hit the wrong hostname
  if (hostname === 'kickdashboard.com' || hostname === 'kickdashboard.com:3000') {
    url.hostname = 'www.kickdashboard.com'
    return NextResponse.redirect(url, 301)
  }

  const res = NextResponse.next()

  // Prevent CDN/edge caches from storing App Router data requests across deploys.
  // When cached incorrectly, clients can hit the classic:
  // "Failed to find Server Action ... This request might be from an older or newer deployment"
  //
  // We only apply this to RSC/data + Server Action request patterns (not to normal navigation HTML).
  const isServerAction = request.method === 'POST' && request.headers.has('next-action')
  const isRsc =
    request.headers.get('rsc') === '1' ||
    request.headers.has('next-router-state-tree') ||
    request.headers.has('next-router-prefetch')

  if (isServerAction || isRsc) {
    res.headers.set('Cache-Control', 'no-store')
    // Helpful for some CDNs that honor alternate cache-control headers
    res.headers.set('CDN-Cache-Control', 'no-store')
    res.headers.set('Surrogate-Control', 'no-store')
  }

  return res
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
}
