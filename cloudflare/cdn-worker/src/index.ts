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
    const url = new URL(request.url)

    // Only serve through the expected host (helps avoid origin confusion)
    if (env.PUBLIC_HOST && url.host !== env.PUBLIC_HOST) {
      return new Response('Not Found', { status: 404 })
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
    const cacheKey = new Request(url.toString(), request)
    const cache = (caches as any).default as Cache
    const cached = await cache.match(cacheKey)
    if (cached) return cached

    const obj = await env.MEDIA_BUCKET.get(key)
    if (!obj) {
      return new Response('Not Found', { status: 404 })
    }

    const headers = new Headers()
    obj.writeHttpMetadata(headers)
    headers.set('etag', obj.httpEtag)

    // Let Cloudflare cache; versioned keys can be long-lived.
    const isVersioned = /\/\d+_[a-zA-Z0-9]+\./.test(key)
    headers.set(
      'cache-control',
      isVersioned ? 'public, max-age=31536000, immutable' : 'public, max-age=3600'
    )

    const resp = new Response(obj.body, { headers })
    ctx.waitUntil(cache.put(cacheKey, resp.clone()))
    return resp
  },
}


