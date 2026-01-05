import crypto from 'crypto'

// Primary shared secret for external tools
const API_SECRET_KEY = process.env.API_SECRET_KEY || ''

// Endpoint-specific keys (optional, for granular access)
const ENDPOINT_KEYS: Record<string, string | undefined> = {
  'stream-leaderboard': process.env.API_KEY_STREAM_LEADERBOARD,
  'chat': process.env.API_KEY_CHAT,
  'sweet-coins': process.env.API_KEY_SWEET_COINS,
}

/**
 * Validate API key from request
 * Checks both query parameter (?api_key=) and header (X-API-Key)
 * 
 * @param request - The incoming request
 * @param endpointName - Optional endpoint name for endpoint-specific key checking
 * @returns true if valid API key is provided, false otherwise
 */
export function validateApiKey(
  request: Request,
  endpointName?: string
): boolean {
  const { searchParams } = new URL(request.url)
  const providedKey = 
    searchParams.get('api_key') || 
    request.headers.get('x-api-key')

  if (!providedKey) return false

  // Check endpoint-specific key first
  if (endpointName) {
    const endpointKey = ENDPOINT_KEYS[endpointName]
    if (endpointKey && timingSafeEqual(providedKey, endpointKey)) {
      return true
    }
  }

  // Fall back to shared API secret
  if (API_SECRET_KEY && timingSafeEqual(providedKey, API_SECRET_KEY)) {
    return true
  }

  return false
}

/**
 * Timing-safe string comparison to prevent timing attacks
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  try {
    return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b))
  } catch {
    return false
  }
}

