const API_MEDIA_PREFIX = '/api/media/'

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, '')
}

export function getMediaCdnBaseUrl(): string | null {
  const raw =
    process.env.MEDIA_CDN_BASE_URL ||
    process.env.R2_PUBLIC_BASE_URL ||
    ''

  const normalized = normalizeBaseUrl(raw)
  return normalized ? normalized : null
}

export function buildMediaUrlFromKey(key: string): string {
  return `${API_MEDIA_PREFIX}${key.replace(/^\/+/, '')}`
}

export async function signCdnPath(path: string, expEpochSeconds: number, secret: string): Promise<string> {
  const { createHmac } = await import('crypto')
  const cleanPath = path.replace(/^\/+/, '')
  const canonical = `${cleanPath}|${expEpochSeconds}`
  const h = createHmac('sha256', secret).update(canonical).digest('base64')
  return h.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

/**
 * If MEDIA_CDN_BASE_URL is configured and the input is a /api/media/<key> URL,
 * rewrite it to the CDN URL. Otherwise return the input unchanged.
 */
export function rewriteApiMediaUrlToCdn(url: string | null | undefined): string | null {
  // With signed CDN URLs, the browser should keep using /api/media/<key>,
  // which then redirects to a short-lived signed CDN URL.
  //
  // For non-R2 images (Kick avatars/thumbnails), route them through our image proxy
  // so they can be cached by the CDN under our domain.
  if (!url) return null

  // Already a local/proxied URL
  if (url.startsWith(API_MEDIA_PREFIX)) return url
  if (url.startsWith('/api/image-proxy')) return url
  if (url.startsWith('/')) return url

  try {
    const u = new URL(url)
    const allowedDomains = [
      'kick.com',
      'files.kick.com',
      'stream.kick.com',
      'api.kick.com',
      'cloudfront.net',
      'amazonaws.com',
    ]

    const isAllowed = allowedDomains.some((d) => u.hostname.includes(d))
    if (!isAllowed) return url

    return `/api/image-proxy?url=${encodeURIComponent(u.toString())}`
  } catch {
    return url
  }
}
