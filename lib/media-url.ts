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
  return url || null
}
