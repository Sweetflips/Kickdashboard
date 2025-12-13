export interface Env {
  // Keep this file typecheckable in the Next.js repo without adding Wrangler types.
  // Cloudflare provides the real R2Bucket type at runtime.
  MEDIA_BUCKET: any
  SIGNING_SECRET: string
  PUBLIC_HOST: string
}

type ExecutionContextLike = {
  waitUntil(promise: Promise<any>): void
}

function base64UrlFromBytes(bytes: ArrayBuffer): string {
  const bin = String.fromCharCode(...new Uint8Array(bytes))
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

async function hmacSha256Base64Url(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message))
  return base64UrlFromBytes(sig)
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let out = 0
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return out === 0
}

function isProbablySafeKey(key: string): boolean {
  // Keep it strict: no traversal, no control chars
  if (!key) return false
  if (key.includes('..')) return false
  if (key.includes('\\')) return false
  if (/[\u0000-\u001F\u007F]/.test(key)) return false
  return true
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContextLike): Promise<Response> {
    try {
      const url = new URL(request.url)

      // Only serve through the expected host (helps avoid origin confusion)
      if (env.PUBLIC_HOST && url.host !== env.PUBLIC_HOST) {
        return new Response('Not Found', { status: 404 })
      }

      // Handle CORS preflight early (before expensive operations)
      if (request.method === 'OPTIONS') {
        return new Response(null, {
          status: 204,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
            'Access-Control-Allow-Headers': 'Range',
            'Access-Control-Max-Age': '86400',
          },
        })
      }

      if (!env.MEDIA_BUCKET || typeof env.MEDIA_BUCKET.get !== 'function') {
        return new Response('Worker misconfigured: MEDIA_BUCKET binding missing', { status: 500 })
      }
      if (!env.SIGNING_SECRET) {
        const keys = Object.keys(env || {}).sort().join(', ')
        const t = typeof (env as any).SIGNING_SECRET
        const len = ((env as any).SIGNING_SECRET ? String((env as any).SIGNING_SECRET).length : 0)
        return new Response(
          `Worker misconfigured: SIGNING_SECRET missing (type=${t}, len=${len}, env keys: ${keys || 'none'})`,
          { status: 500 }
        )
      }

      const key = decodeURIComponent(url.pathname.replace(/^\/+/, ''))
      if (!isProbablySafeKey(key)) {
        return new Response('Bad Request', { status: 400 })
      }

      const exp = url.searchParams.get('exp')
      const sig = url.searchParams.get('sig')

      if (!exp || !sig) {
        return new Response('Forbidden', { status: 403 })
      }

      const expNum = Number(exp)
      if (!Number.isFinite(expNum)) {
        return new Response('Forbidden', { status: 403 })
      }

      const now = Math.floor(Date.now() / 1000)
      if (expNum < now) {
        return new Response('Forbidden', { status: 403 })
      }

      const canonical = `${key}|${expNum}`
      const expected = await hmacSha256Base64Url(env.SIGNING_SECRET, canonical)
      if (!timingSafeEqual(expected, sig)) {
        return new Response('Forbidden', { status: 403 })
      }

      // Cache key includes signature so shared cache is safe.
      // Note: We check cache but always ensure CORS headers are present
      const cacheKey = new Request(url.toString(), request)
      const cache = (typeof caches !== 'undefined' ? (caches as any).default : undefined) as Cache | undefined
      if (cache) {
        const cached = await cache.match(cacheKey)
        if (cached) {
          // Ensure cached response has CORS headers (in case it was cached before CORS fix)
          const cachedHeaders = new Headers(cached.headers)
          if (!cachedHeaders.get('Access-Control-Allow-Origin')) {
            cachedHeaders.set('Access-Control-Allow-Origin', '*')
            cachedHeaders.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS')
            cachedHeaders.set('Access-Control-Expose-Headers', 'Content-Length, Content-Type, ETag')
            return new Response(cached.body, { headers: cachedHeaders, status: cached.status })
          }
          return cached
        }
      }

      let obj
      try {
        obj = await env.MEDIA_BUCKET.get(key)
      } catch (r2Error: any) {
        console.error('[R2 Fetch Error]', {
          key,
          error: r2Error?.message,
          stack: r2Error?.stack,
        })
        return new Response(`R2 fetch failed: ${r2Error?.message || 'Unknown error'}`, { status: 500 })
      }

      if (!obj) {
        console.warn('[R2 Object Not Found]', { key })
        return new Response('Not Found', { status: 404 })
      }

      const headers = new Headers()
      if (typeof obj.writeHttpMetadata === 'function') obj.writeHttpMetadata(headers)
      if (obj.httpEtag) headers.set('etag', obj.httpEtag)

      // Always add CORS headers for cross-origin requests (browser always sends origin header)
      headers.set('Access-Control-Allow-Origin', '*')
      headers.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS')
      headers.set('Access-Control-Expose-Headers', 'Content-Length, Content-Type, ETag')

      // Let Cloudflare cache; versioned keys can be long-lived.
      const isVersioned = /\/\d+_[a-zA-Z0-9]+\./.test(key)
      headers.set(
        'cache-control',
        isVersioned ? 'public, max-age=31536000, immutable' : 'public, max-age=3600'
      )

      const resp = new Response(obj.body, { headers })
      if (cache) ctx.waitUntil(cache.put(cacheKey, resp.clone()))
      return resp
    } catch (err: any) {
      // Log full error for debugging (only visible in Cloudflare dashboard)
      console.error('[CDN Worker Error]', {
        message: err?.message,
        stack: err?.stack,
        name: err?.name,
      })

      // Avoid leaking secrets; return minimal debug info.
      const msg = err?.message ? String(err.message) : 'Unknown error'
      return new Response(`Worker error: ${msg}`, { status: 500 })
    }
  },
}
