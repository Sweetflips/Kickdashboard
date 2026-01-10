/**
 * Kick Dev API Client
 *
 * Handles authentication and API calls to the official Kick Dev API.
 * Uses broadcaster's User Access Token from database for API calls.
 */

import { db } from '@/lib/db'
import { decryptToken, encryptToken, hashToken } from '@/lib/encryption'
import { getKickBotCredentials, getKickUserCredentials } from '@/lib/kick-oauth-creds'

// Kick Dev API endpoints
// Base URL for Kick Dev API v1 (public endpoint)
const KICK_API_BASE = process.env.KICK_API_BASE || 'https://api.kick.com/public/v1'
// OAuth token endpoint (hosted on id.kick.com)
const KICK_AUTH_URL = process.env.KICK_AUTH_URL || 'https://id.kick.com/oauth/token'
// Broadcaster channel slug to use for API calls
const BROADCASTER_SLUG = process.env.KICK_CHANNEL_SLUG || 'sweetflips'

// ============================================================================
// GLOBAL RATE LIMITER - Prevents overwhelming the Kick API
// ============================================================================

/**
 * Global rate limiter state
 * - Limits concurrent requests to avoid API hammering
 * - Implements coordinated backoff when rate limited
 */
const rateLimiter = {
    // Maximum concurrent API requests
    maxConcurrent: 2,
    // Current number of in-flight requests
    currentRequests: 0,
    // Queue of pending requests
    queue: [] as Array<() => void>,
    // Global backoff state - when rate limited, all requests wait
    globalBackoffUntil: 0,
    // Minimum delay between requests (ms)
    minDelayBetweenRequests: 200,
    // Last request timestamp
    lastRequestTime: 0,
    // Requests per minute tracking (for burst protection)
    requestTimestamps: [] as number[],
    // Max requests per minute
    maxRequestsPerMinute: 30,
}

/**
 * Acquire a slot to make an API request
 * Returns a release function to call when done
 */
export async function acquireRateLimitSlot(): Promise<() => void> {
    // Wait for global backoff if we're rate limited
    const now = Date.now()
    if (rateLimiter.globalBackoffUntil > now) {
        const waitTime = rateLimiter.globalBackoffUntil - now
        console.log(`[Kick API Rate Limiter] Global backoff active, waiting ${waitTime}ms`)
        await new Promise(resolve => setTimeout(resolve, waitTime))
    }

    // Clean up old request timestamps (older than 1 minute)
    const oneMinuteAgo = Date.now() - 60000
    rateLimiter.requestTimestamps = rateLimiter.requestTimestamps.filter(t => t > oneMinuteAgo)

    // Check if we've exceeded requests per minute
    if (rateLimiter.requestTimestamps.length >= rateLimiter.maxRequestsPerMinute) {
        const oldestRequest = rateLimiter.requestTimestamps[0]
        const waitTime = oldestRequest + 60000 - Date.now() + 100 // Add 100ms buffer
        if (waitTime > 0) {
            console.log(`[Kick API Rate Limiter] Rate limit protection: waiting ${waitTime}ms (${rateLimiter.requestTimestamps.length} requests in last minute)`)
            await new Promise(resolve => setTimeout(resolve, waitTime))
        }
    }

    // Enforce minimum delay between requests
    const timeSinceLastRequest = Date.now() - rateLimiter.lastRequestTime
    if (timeSinceLastRequest < rateLimiter.minDelayBetweenRequests) {
        const waitTime = rateLimiter.minDelayBetweenRequests - timeSinceLastRequest
        await new Promise(resolve => setTimeout(resolve, waitTime))
    }

    // Wait for a slot if at max concurrent
    if (rateLimiter.currentRequests >= rateLimiter.maxConcurrent) {
        await new Promise<void>(resolve => {
            rateLimiter.queue.push(resolve)
        })
    }

    // Acquire the slot
    rateLimiter.currentRequests++
    rateLimiter.lastRequestTime = Date.now()
    rateLimiter.requestTimestamps.push(Date.now())

    // Return release function
    return () => {
        rateLimiter.currentRequests--
        // Wake up next queued request
        const next = rateLimiter.queue.shift()
        if (next) {
            next()
        }
    }
}

/**
 * Trigger global backoff when rate limited
 * All pending and new requests will wait
 */
function triggerGlobalBackoff(backoffMs: number): void {
    const newBackoffUntil = Date.now() + backoffMs
    // Only extend backoff, never shorten it
    if (newBackoffUntil > rateLimiter.globalBackoffUntil) {
        rateLimiter.globalBackoffUntil = newBackoffUntil
        console.log(`[Kick API Rate Limiter] Global backoff triggered for ${backoffMs}ms`)
    }
}

/**
 * Get current rate limiter stats (for debugging)
 */
export function getRateLimiterStats(): {
    currentRequests: number
    queueLength: number
    requestsInLastMinute: number
    globalBackoffRemaining: number
} {
    return {
        currentRequests: rateLimiter.currentRequests,
        queueLength: rateLimiter.queue.length,
        requestsInLastMinute: rateLimiter.requestTimestamps.filter(t => t > Date.now() - 60000).length,
        globalBackoffRemaining: Math.max(0, rateLimiter.globalBackoffUntil - Date.now()),
    }
}

interface AppAccessTokenResponse {
    access_token: string
    token_type: string
    expires_in: number
    scope?: string
}

interface KickThumbnail {
    url: string
    responsive?: string
}

// Official Kick API /livestreams response format (per api.kick.com/swagger/v1/doc.yaml)
interface KickLivestream {
    broadcaster_user_id: number
    channel_id: number
    slug: string
    stream_title?: string
    thumbnail: string | null  // Direct URL string per API docs
    viewer_count?: number
    started_at: string
    category?: {
        id: number
        name: string
        thumbnail: string
    }
    custom_tags?: string[]
    has_mature_content?: boolean
    language?: string
    // Legacy v2 API fields (not in official v1 API)
    id?: number
    session_title?: string | null
    is_live?: boolean
    created_at?: string
    duration?: number
}

interface KickChannelStream {
    is_live: boolean
    custom_tags?: string[]
}

interface KickChannel {
    id?: number
    broadcaster_user_id?: number
    slug: string
    banner_picture?: string | null
    stream?: KickChannelStream | null
    livestream?: KickLivestream | null // Legacy v2 API format
    thumbnail?: string | KickThumbnail | null // Legacy v2 API format
    user?: {
        id: number
        username: string
        profile_picture?: string | null
        bio?: string | null
    }
}

interface KickUser {
    user_id: number
    name: string
    email: string | null
    profile_picture: string | null
}

interface StreamThumbnail {
    streamId: string              // broadcaster_user_id (Kick doesn't provide unique stream IDs)
    channelSlug: string
    thumbnailUrl: string | null
    startedAt?: string            // Use started_at to match with local stream sessions
    width?: number
    height?: number
    fetchedAt: Date
}

// In-memory token cache
let cachedToken: {
    token: string
    expiresAt: number
    source: 'user' | 'app'
} | null = null

// Normalize livestream.is_live flag from Kick APIs into a strict boolean.
// Some Kick responses have used numbers or strings here; we defensively
// coerce and default to "offline" for unknown values to avoid false
// positives where a stream is treated as live when it is actually offline.
function normalizeIsLiveFlag(raw: unknown): boolean {
    if (typeof raw === 'boolean') return raw
    if (typeof raw === 'number') return raw !== 0
    if (typeof raw === 'string') {
        const value = raw.trim().toLowerCase()
        if (['true', '1', 'yes', 'live', 'online'].includes(value)) return true
        if (['false', '0', 'no', 'offline'].includes(value)) return false
    }

    if (raw === null || raw === undefined) return false

    console.warn('[Kick API] Unexpected is_live value from Kick API, treating as offline:', {
        value: raw,
        type: typeof raw,
    })
    return false
}

/**
 * Get broadcaster's User Access Token from database
 * Falls back to App Access Token if user token not available
 */
export async function getBroadcasterToken(): Promise<string> {
    // Check if cached token is still valid (with 5 minute buffer)
    if (cachedToken && cachedToken.expiresAt > Date.now() + 5 * 60 * 1000) {
        // Don't log every cache hit - too noisy
        return cachedToken.token
    }

    // Try to get broadcaster's token from database
    try {
        console.log(`[Kick API] Looking for broadcaster token for: ${BROADCASTER_SLUG}`)

        const broadcaster = await (db as any).user.findFirst({
            where: {
                username: {
                    equals: BROADCASTER_SLUG,
                    mode: 'insensitive',
                },
            },
            select: {
                access_token_encrypted: true,
                refresh_token_encrypted: true,
                username: true,
            },
        })

        if (broadcaster?.access_token_encrypted) {
            try {
                const accessToken = decryptToken(broadcaster.access_token_encrypted)
                console.log(`[Kick API] Successfully retrieved token for broadcaster: ${broadcaster.username}`)

                // Cache the token (assume 1 hour validity, will be refreshed on next call if expired)
                cachedToken = {
                    token: accessToken,
                    expiresAt: Date.now() + 60 * 60 * 1000, // 1 hour
                    source: 'user',
                }

                return accessToken
            } catch (decryptError) {
                console.warn(`[Kick API] Failed to decrypt broadcaster token:`, decryptError instanceof Error ? decryptError.message : 'Unknown error')
            }
        } else {
            console.log(`[Kick API] No encrypted token found for broadcaster: ${BROADCASTER_SLUG}`)
        }
    } catch (dbError) {
        console.warn(`[Kick API] Error fetching broadcaster from database:`, dbError instanceof Error ? dbError.message : 'Unknown error')
    }

    // Fallback to App Access Token
    console.log(`[Kick API] Falling back to App Access Token`)
    return getAppAccessToken()
}

/**
 * Refresh broadcaster's access token using refresh token from database
 */
export async function refreshBroadcasterToken(): Promise<string | null> {
    try {
        const broadcaster = await (db as any).user.findFirst({
            where: {
                username: {
                    equals: BROADCASTER_SLUG,
                    mode: 'insensitive',
                },
            },
            select: {
                refresh_token_encrypted: true,
                kick_user_id: true,
                username: true,
            },
        })

        if (!broadcaster?.refresh_token_encrypted) {
            console.log(`[Kick API] No refresh token found for broadcaster: ${BROADCASTER_SLUG}`)
            return null
        }

        const refreshToken = decryptToken(broadcaster.refresh_token_encrypted)
        const { clientId, clientSecret } = getKickUserCredentials()

        // Build redirect URI (use a default one for server-side refresh)
        const redirectUri = process.env.KICK_REDIRECT_URI || 'http://localhost:3000/api/auth/callback'

        console.log(`[Kick API] Attempting to refresh token for broadcaster: ${broadcaster.username}`)

        const params = new URLSearchParams({
            grant_type: 'refresh_token',
            client_id: clientId,
            client_secret: clientSecret,
            refresh_token: refreshToken,
            redirect_uri: redirectUri,
        })

        const response = await fetch(KICK_AUTH_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: params.toString(),
        })

        if (!response.ok) {
            const errorText = await response.text()
            console.warn(`[Kick API] Token refresh failed: ${response.status} ${errorText}`)
            return null
        }

        const data: AppAccessTokenResponse & { refresh_token?: string } = await response.json()

        // Update tokens in database (both encrypted and hashed)
        await (db as any).user.update({
            where: { kick_user_id: broadcaster.kick_user_id },
            data: {
                access_token_hash: hashToken(data.access_token),
                refresh_token_hash: data.refresh_token ? hashToken(data.refresh_token) : undefined,
                access_token_encrypted: encryptToken(data.access_token),
                ...(data.refresh_token && {
                    refresh_token_encrypted: encryptToken(data.refresh_token),
                }),
            },
        })

        // Update cache
        cachedToken = {
            token: data.access_token,
            expiresAt: Date.now() + (data.expires_in * 1000),
            source: 'user',
        }

        console.log(`[Kick API] Successfully refreshed token for broadcaster: ${broadcaster.username}`)
        return data.access_token
    } catch (error) {
        console.error(`[Kick API] Error refreshing broadcaster token:`, error instanceof Error ? error.message : 'Unknown error')
        return null
    }
}

/**
 * Get App Access Token (client credentials flow)
 * Used as fallback when user token not available
 */
export async function getAppAccessToken(): Promise<string> {
    const clientId = process.env.KICK_CLIENT_ID
    const clientSecret = process.env.KICK_CLIENT_SECRET

    if (!clientId || !clientSecret) {
        throw new Error('KICK_CLIENT_ID and KICK_CLIENT_SECRET must be set in environment variables')
    }

    try {
        console.log(`[Kick API] Requesting App Access Token from ${KICK_AUTH_URL}`)
        const response = await fetch(KICK_AUTH_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                grant_type: 'client_credentials',
                client_id: clientId,
                client_secret: clientSecret,
            }),
        })

        if (!response.ok) {
            const errorText = await response.text()
            console.error(`[Kick API] Token request failed: ${response.status} ${errorText}`)
            throw new Error(`Failed to get access token: ${response.status} ${errorText}`)
        }

        const data: AppAccessTokenResponse = await response.json()

        // Cache the token
        cachedToken = {
            token: data.access_token,
            expiresAt: Date.now() + (data.expires_in * 1000),
            source: 'app',
        }

        console.log(`[Kick API] Successfully obtained App Access Token (expires in ${data.expires_in}s)`)
        return data.access_token
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error)
        console.error(`[Kick API] Error fetching App Access Token:`, errorMsg)
        throw error
    }
}

/**
 * Make authenticated request to Kick API with retry logic
 */
async function kickApiRequest<T>(
    endpoint: string,
    options: RequestInit = {},
    retries = 2
): Promise<T> {
    const clientId = process.env.KICK_CLIENT_ID
    const url = endpoint.startsWith('http') ? endpoint : `${KICK_API_BASE}${endpoint}`

    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            // Get fresh token on each attempt (especially after 401)
            const token = await getBroadcasterToken()

            const headers: Record<string, string> = {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                ...(options.headers as Record<string, string>),
            }

            // Add Client-Id header if available (required by Kick API)
            if (clientId) {
                headers['Client-Id'] = clientId
            }

            const response = await fetch(url, {
                ...options,
                headers,
            })

            // Handle rate limiting (429)
            if (response.status === 429) {
                const retryAfter = response.headers.get('Retry-After')
                const waitTime = retryAfter ? parseInt(retryAfter, 10) * 1000 : (attempt + 1) * 1000

                if (attempt < retries) {
                    console.warn(`Rate limited, waiting ${waitTime}ms before retry ${attempt + 1}/${retries}`)
                    await new Promise(resolve => setTimeout(resolve, waitTime))
                    continue
                }
            }

            // Handle 401 - token might be expired, try to refresh if it's a user token
            if (response.status === 401 && attempt === 0) {
                console.warn('Got 401, attempting token refresh')
                clearTokenCache()

                // Try to refresh broadcaster token if it was a user token
                const refreshedToken = await refreshBroadcasterToken()
                if (refreshedToken) {
                    // Retry with refreshed token (will be fetched fresh on next iteration)
                    continue
                }

                // If refresh failed, fall back to app token and retry
                continue
            }

            if (!response.ok) {
                const errorText = await response.text()
                throw new Error(`Kick API error: ${response.status} ${errorText}`)
            }

            return response.json()
        } catch (error) {
            // If this is the last attempt, throw the error
            if (attempt === retries) {
                throw error
            }

            // Exponential backoff for retries
            const waitTime = Math.min(1000 * Math.pow(2, attempt), 5000)
            console.warn(`Request failed, retrying in ${waitTime}ms (attempt ${attempt + 1}/${retries})`)
            await new Promise(resolve => setTimeout(resolve, waitTime))
        }
    }

    throw new Error('Failed after all retries')
}

/**
 * Extract thumbnail URL from various Kick API response formats
 */
function extractThumbnailUrl(thumbnail: string | KickThumbnail | null | undefined): string | null {
    if (!thumbnail) return null

    if (typeof thumbnail === 'string') {
        return thumbnail
    }

    if (typeof thumbnail === 'object' && thumbnail.url) {
        return thumbnail.url
    }

    return null
}

/**
 * Get channel with livestream info by slug
 * Tries public v1 API first, falls back to legacy v2 API if needed
 */
export async function getChannelWithLivestream(slug: string): Promise<StreamThumbnail | null> {
    try {
        const startTime = Date.now()
        console.log(`[Kick API] Fetching channel data for: ${slug}`)

        // Try public v1 API first - use slug[] array syntax as per official API docs
        const endpoint = `/channels?slug[]=${encodeURIComponent(slug)}`
        const url = `${KICK_API_BASE}${endpoint}`

        let response: Response | null = null
        let useV2Fallback = false

        // Try without authentication first
        response = await fetch(url, {
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
            },
        })

        // If we get 401, try with authentication
        if (response.status === 401) {
            console.log(`[Kick API] Got 401 without auth, retrying with authentication`)
            const token = await getBroadcasterToken()
            const clientId = process.env.KICK_CLIENT_ID

            const headers: Record<string, string> = {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/json',
                'Content-Type': 'application/json',
            }

            if (clientId) {
                headers['Client-Id'] = clientId
            }

            response = await fetch(url, { headers })

            // If still 401, fall back to v2 API
            if (response.status === 401) {
                console.log(`[Kick API] Still 401 with auth, falling back to v2 API`)
                useV2Fallback = true
            }
        }

        // Fallback to legacy v2 API if v1 fails or returns 401
        if (useV2Fallback || !response || !response.ok) {
            // If response exists but not ok, log the error
            if (response && !response.ok) {
                const errorText = await response.text().catch(() => 'Could not read error')
                console.warn(`[Kick API] V1 API failed: ${response.status} ${errorText.substring(0, 200)}`)
            }
            console.log(`[Kick API] Using legacy v2 API fallback for ${slug}`)
            const v2Url = `https://kick.com/api/v2/channels/${slug.toLowerCase()}`

            response = await fetch(v2Url, {
                headers: {
                    'Accept': 'application/json',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                },
            })

            if (!response.ok) {
                const errorText = await response.text()
                console.warn(`[Kick API] V2 API also failed: ${response.status} ${errorText}`)
                return null
            }

            // Parse v2 API response
            const v2Data: any = await response.json()
            const livestream = v2Data.livestream
            const isLive = livestream ? normalizeIsLiveFlag(livestream.is_live) : false

            if (!livestream || !isLive) {
                console.log(`[Kick API] Channel ${slug} has no active livestream (v2 API, normalized is_live=${isLive})`)
                return null
            }

            // Debug: Log v2 API response
            console.log(`[Kick API] V2 livestream response:`, JSON.stringify(livestream, null, 2).substring(0, 500))

            let thumbnailUrl: string | null = null
            if (livestream.thumbnail) {
                thumbnailUrl = extractThumbnailUrl(livestream.thumbnail)
                console.log(`[Kick API] V2 extracted thumbnail: ${thumbnailUrl}`)
            }

            // Try to get the actual stream/session ID, not just broadcaster ID
            const streamId = livestream.id?.toString() ||
                            livestream.session_id?.toString() ||
                            livestream.broadcaster_user_id?.toString() ||
                            v2Data.id?.toString() ||
                            'unknown'
            console.log(`[Kick API] V2 using streamId: ${streamId}`)

            return {
                streamId,
                channelSlug: slug,
                thumbnailUrl,
                startedAt: livestream.started_at || livestream.created_at || undefined,
                fetchedAt: new Date(),
            }
        }

        if (!response.ok) {
            const errorText = await response.text()
            throw new Error(`Kick API error: ${response.status} ${errorText}`)
        }

        const responseData: any = await response.json()
        const duration = Date.now() - startTime

        // Log raw response for debugging
        console.log(`[Kick API] Raw response for ${slug}:`, JSON.stringify(responseData, null, 2).substring(0, 500))

        // Handle v1 API response format: { data: [channel1, channel2, ...] }
        let channel: KickChannel | null = null

        if (Array.isArray(responseData.data)) {
            // Response is { data: [channel1, channel2, ...] }
            if (responseData.data.length > 0) {
                channel = responseData.data[0]
                console.log(`[Kick API] Found channel in array format, using first item`)
            } else {
                console.warn(`[Kick API] Response has empty data array`)
            }
        } else if (responseData.data && typeof responseData.data === 'object' && !Array.isArray(responseData.data)) {
            // Response is { data: { channel object } }
            channel = responseData.data
            console.log(`[Kick API] Found channel in data object format`)
        } else if (responseData.id || responseData.broadcaster_user_id) {
            // Response is directly a channel object (legacy format)
            channel = responseData
            console.log(`[Kick API] Found channel in direct object format`)
        } else {
            console.warn(`[Kick API] Unknown response format. Keys:`, Object.keys(responseData))
        }

        if (!channel || (!channel.id && !channel.broadcaster_user_id)) {
            console.warn(`[Kick API] Invalid channel response format for ${slug}. Response structure:`, {
                hasData: !!responseData.data,
                dataIsArray: Array.isArray(responseData.data),
                dataType: typeof responseData.data,
                hasId: !!responseData.id,
                hasBroadcasterUserId: !!responseData.broadcaster_user_id,
                keys: Object.keys(responseData),
                fullResponse: JSON.stringify(responseData).substring(0, 300),
            })
            // Try v2 API as fallback
            console.log(`[Kick API] Falling back to v2 API due to invalid response format`)
            const v2Url = `https://kick.com/api/v2/channels/${slug.toLowerCase()}`
            const v2Response = await fetch(v2Url, {
                headers: {
                    'Accept': 'application/json',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                },
            })

            if (v2Response.ok) {
                const v2Data: any = await v2Response.json()
                const livestream = v2Data.livestream
                if (livestream && normalizeIsLiveFlag(livestream.is_live)) {
                    let thumbnailUrl: string | null = null
                    if (livestream.thumbnail) {
                        thumbnailUrl = extractThumbnailUrl(livestream.thumbnail)
                    }
                    return {
                        streamId: livestream.id?.toString() || v2Data.id?.toString() || 'unknown',
                        channelSlug: slug,
                        thumbnailUrl,
                        startedAt: livestream.started_at || livestream.created_at || undefined,
                        fetchedAt: new Date(),
                    }
                }
            }
            return null
        }

        console.log(`[Kick API] Fetched channel ${slug} in ${duration}ms`)

        console.log(`[Kick API] Channel data:`, JSON.stringify({
            id: channel.id,
            broadcaster_user_id: channel.broadcaster_user_id,
            slug: channel.slug,
            hasStream: !!channel.stream,
            streamIsLive: channel.stream?.is_live,
        }, null, 2))

        // Use /livestreams endpoint as the source of truth for live status and thumbnails
        // According to docs.kick.com/apis/livestreams, this endpoint returns thumbnail directly
        // If it returns data, the stream is live; if empty array, stream is offline
        let thumbnailUrl: string | null = null
        const broadcasterUserId = channel.broadcaster_user_id
        let streamId: string = (channel.id?.toString() || broadcasterUserId?.toString() || 'unknown')

        // Fetch from livestreams endpoint - this is the authoritative source for live streams and thumbnails
        if (broadcasterUserId) {
            // Acquire rate limit slot before making /livestreams request
            const releaseSlot = await acquireRateLimitSlot()
            try {
                // Fetch thumbnail from /livestreams endpoint using broadcaster_user_id
                // Note: /livestreams endpoint doesn't support slug, only broadcaster_user_id[]
                const livestreamsEndpoint = `/livestreams?broadcaster_user_id[]=${broadcasterUserId}`
                const livestreamsUrl = `${KICK_API_BASE}${livestreamsEndpoint}`

                let livestreamsResponse: Response | null = null

                // Try without authentication first
                livestreamsResponse = await fetch(livestreamsUrl, {
                    headers: {
                        'Accept': 'application/json',
                        'Content-Type': 'application/json',
                    },
                })

                // Handle 429 rate limit
                if (livestreamsResponse.status === 429) {
                    const retryAfter = livestreamsResponse.headers.get('Retry-After')
                    const backoffMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : 30000
                    console.warn(`[Channel API] /livestreams endpoint returned 429, backing off for ${backoffMs}ms`)
                    triggerGlobalBackoff(backoffMs)
                    return null
                }

                // If we get 401, try with authentication
                if (livestreamsResponse.status === 401) {
                    const token = await getBroadcasterToken()
                    const clientId = process.env.KICK_CLIENT_ID

                    const headers: Record<string, string> = {
                        'Authorization': `Bearer ${token}`,
                        'Accept': 'application/json',
                        'Content-Type': 'application/json',
                    }

                    if (clientId) {
                        headers['Client-Id'] = clientId
                    }

                    livestreamsResponse = await fetch(livestreamsUrl, { headers })

                    // Handle 429 on authenticated request
                    if (livestreamsResponse.status === 429) {
                        const retryAfter = livestreamsResponse.headers.get('Retry-After')
                        const backoffMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : 30000
                        console.warn(`[Channel API] /livestreams endpoint returned 429 (authenticated), backing off for ${backoffMs}ms`)
                        triggerGlobalBackoff(backoffMs)
                        return null
                    }
                }

                if (livestreamsResponse && livestreamsResponse.ok) {
                    const livestreamsData: any = await livestreamsResponse.json()

                    // Livestreams API returns { data: [...] }
                    // If data array has items, stream is live and contains thumbnail
                    if (Array.isArray(livestreamsData.data) && livestreamsData.data.length > 0) {
                        // Find the livestream that matches our requested broadcaster_user_id
                        // The Kick API may return other streams if the filter doesn't work properly
                        const livestream = livestreamsData.data.find(
                            (ls: KickLivestream) => ls.broadcaster_user_id === broadcasterUserId ||
                                ls.slug?.toLowerCase() === slug.toLowerCase()
                        ) as KickLivestream | undefined

                        if (!livestream) {
                            // No matching livestream found - the API returned data for other channels
                            const returnedBroadcasterIds = livestreamsData.data.map((ls: KickLivestream) => ({
                                broadcaster_user_id: ls.broadcaster_user_id,
                                slug: ls.slug,
                            }))
                            console.warn(`[Kick API] Livestream response mismatch: requested broadcaster ${broadcasterUserId} (${slug}), but response contains different channels`, {
                                requestedBroadcasterId: broadcasterUserId,
                                requestedSlug: slug,
                                returnedChannels: returnedBroadcasterIds,
                                totalReturned: livestreamsData.data.length,
                            })
                            console.log(`[Kick API] Channel ${slug} has no active livestream (no matching data in response)`)
                            return null
                        }

                        // Debug: Log livestream response
                        console.log(`[Kick API] Livestreams response:`, JSON.stringify(livestream, null, 2))

                        // Per official Kick API docs (api.kick.com/swagger/v1/doc.yaml):
                        // thumbnail is a direct URL string, not an object
                        if (livestream.thumbnail) {
                            // Handle both string and object formats for backwards compatibility
                            if (typeof livestream.thumbnail === 'string') {
                                thumbnailUrl = livestream.thumbnail
                            } else {
                                thumbnailUrl = extractThumbnailUrl(livestream.thumbnail)
                            }
                            console.log(`[Kick API] Thumbnail URL: ${thumbnailUrl}`)
                        } else {
                            console.warn(`[Kick API] No thumbnail field in livestream response`)
                        }

                        // Per official API docs: There is NO unique stream session ID!
                        // The API only provides broadcaster_user_id and channel_id
                        // We use broadcaster_user_id as the identifier
                        streamId = livestream.broadcaster_user_id.toString()

                        // Capture started_at for matching with local sessions
                        const startedAt = livestream.started_at
                        console.log(`[Kick API] Stream is LIVE - broadcaster: ${streamId}, started_at: ${startedAt}, thumbnail: ${thumbnailUrl ? 'yes' : 'no'}`)

                        // Return early with all data
                        return {
                            streamId,
                            channelSlug: slug,
                            thumbnailUrl,
                            startedAt,
                            fetchedAt: new Date(),
                        }
                    } else {
                        // Empty data array means stream is not live
                        console.log(`[Kick API] Channel ${slug} has no active livestream (empty livestreams response)`)
                        return null
                    }
                } else {
                    const errorText = livestreamsResponse ? await livestreamsResponse.text().catch(() => '') : 'no response'
                    console.warn(`[Kick API] Livestreams endpoint returned ${livestreamsResponse?.status || 'no response'}: ${errorText.substring(0, 200)}`)
                    // If livestreams endpoint fails, we can't determine if stream is live
                    return null
                }
            } catch (livestreamsError) {
                console.warn(`[Kick API] Failed to fetch thumbnail from livestreams endpoint:`,
                    livestreamsError instanceof Error ? livestreamsError.message : 'Unknown error')
                // If livestreams fetch fails, we can't determine if stream is live
                return null
            } finally {
                releaseSlot()
            }
        } else {
            console.warn(`[Kick API] No broadcaster_user_id found in channel response, cannot fetch thumbnail from livestreams endpoint`)
            // Without broadcaster_user_id, we can't query /livestreams, so return null
            return null
        }

        // If we reach here, something went wrong - we should have returned inside the if block
        console.error(`[Kick API] Unexpected code path for ${slug}`)
        return null
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        console.error(`[Kick API] Error fetching channel ${slug}:`, errorMessage)

        // Log more details for debugging
        if (error instanceof Error && error.message.includes('401')) {
            console.error(`[Kick API] Authentication failed - check KICK_CLIENT_ID and KICK_CLIENT_SECRET`)
        } else if (error instanceof Error && error.message.includes('404')) {
            console.warn(`[Kick API] Channel ${slug} not found`)
        }

        // Return null instead of throwing to allow graceful degradation
        return null
    }
}

/**
 * Get livestreams (for bulk operations)
 * Uses GET /public/v1/livestreams endpoint
 * Tries without auth first, then with auth if needed
 * Includes rate limiting and 429 handling with exponential backoff
 */
export async function getLivestreams(filters?: {
    broadcaster_user_id?: number[]
    limit?: number
}): Promise<StreamThumbnail[]> {
    const maxRetries = 3
    let lastError: Error | null = null

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        // Acquire rate limit slot before making request
        const releaseSlot = await acquireRateLimitSlot()

        try {
            const params = new URLSearchParams()
            if (filters?.broadcaster_user_id) {
                filters.broadcaster_user_id.forEach(id => {
                    params.append('broadcaster_user_id[]', id.toString())
                })
            }
            if (filters?.limit) {
                params.append('limit', filters.limit.toString())
            }

            const queryString = params.toString()
            const endpoint = `/livestreams${queryString ? `?${queryString}` : ''}`
            const url = `${KICK_API_BASE}${endpoint}`

            // Try without authentication first (public endpoint might not require auth)
            let response = await fetch(url, {
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                },
            })

            // Handle 429 rate limit
            if (response.status === 429) {
                const retryAfter = response.headers.get('Retry-After')
                const backoffMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : Math.min(30000, 5000 * Math.pow(2, attempt))
                console.warn(`[Kick API] /livestreams endpoint returned 429, backing off for ${backoffMs}ms (attempt ${attempt + 1}/${maxRetries})`)
                triggerGlobalBackoff(backoffMs)
                releaseSlot()
                await new Promise(resolve => setTimeout(resolve, backoffMs))
                continue
            }

            // If we get 401, try with authentication
            if (response.status === 401) {
                console.log(`[Kick API] Got 401 without auth for livestreams, retrying with authentication`)
                const token = await getBroadcasterToken()
                const clientId = process.env.KICK_CLIENT_ID

                const headers: Record<string, string> = {
                    'Authorization': `Bearer ${token}`,
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                }

                if (clientId) {
                    headers['Client-Id'] = clientId
                }

                response = await fetch(url, { headers })

                // Handle 429 on authenticated request
                if (response.status === 429) {
                    const retryAfter = response.headers.get('Retry-After')
                    const backoffMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : Math.min(30000, 5000 * Math.pow(2, attempt))
                    console.warn(`[Kick API] /livestreams endpoint returned 429 (authenticated), backing off for ${backoffMs}ms`)
                    triggerGlobalBackoff(backoffMs)
                    releaseSlot()
                    await new Promise(resolve => setTimeout(resolve, backoffMs))
                    continue
                }
            }

            if (!response.ok) {
                const errorText = await response.text()
                throw new Error(`Kick API error: ${response.status} ${errorText}`)
            }

            const apiResponse: { data: KickLivestream[] } = await response.json()

            // Filter response to only include requested broadcaster IDs
            // The Kick API may return other streams if the filter doesn't work properly
            let filteredData = apiResponse.data
            if (filters?.broadcaster_user_id && filters.broadcaster_user_id.length > 0) {
                const requestedIds = new Set(filters.broadcaster_user_id)
                filteredData = apiResponse.data.filter(ls => requestedIds.has(ls.broadcaster_user_id))

                if (filteredData.length !== apiResponse.data.length) {
                    console.warn(`[Kick API] Livestreams response contained ${apiResponse.data.length - filteredData.length} unrequested streams, filtered out`)
                }
            }

            return filteredData.map(livestream => ({
                streamId: livestream.broadcaster_user_id.toString(),
                channelSlug: livestream.slug || '',
                // Per API docs: thumbnail is a direct string URL
                thumbnailUrl: typeof livestream.thumbnail === 'string'
                    ? livestream.thumbnail
                    : extractThumbnailUrl(livestream.thumbnail),
                startedAt: livestream.started_at,
                fetchedAt: new Date(),
            }))
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error))
            console.error(`[Kick API] Error fetching livestreams (attempt ${attempt + 1}/${maxRetries}):`, lastError.message)

            // If not last attempt, wait before retry
            if (attempt < maxRetries - 1) {
                const backoffMs = Math.min(10000, 1000 * Math.pow(2, attempt))
                await new Promise(resolve => setTimeout(resolve, backoffMs))
            }
        } finally {
            releaseSlot()
        }
    }

    console.error('[Kick API] All retries exhausted for getLivestreams')
    return []
}

/**
 * Sync thumbnails for active streams
 * Optimized to batch fetch channels and livestreams (up to 50 at once per API limit)
 */
export async function syncThumbnailsForActiveStreams(
    channelSlugs: string[]
): Promise<Map<string, string | null>> {
    const results = new Map<string, string | null>()

    if (channelSlugs.length === 0) {
        return results
    }

    try {
        // Step 1: Batch fetch channels to get broadcaster_user_ids (up to 50 at once)
        const channelBatchSize = 50
        const slugToBroadcasterId = new Map<string, number>()
        const slugToChannelId = new Map<string, number>()

        for (let i = 0; i < channelSlugs.length; i += channelBatchSize) {
            const batch = channelSlugs.slice(i, i + channelBatchSize)

            try {
                // Build query with slug[] array syntax
                const params = new URLSearchParams()
                batch.forEach(slug => {
                    params.append('slug[]', slug)
                })

                const endpoint = `/channels?${params.toString()}`
                const url = `${KICK_API_BASE}${endpoint}`

                let response: Response | null = null

                // Try without authentication first
                response = await fetch(url, {
                    headers: {
                        'Accept': 'application/json',
                        'Content-Type': 'application/json',
                    },
                })

                // If we get 401, try with authentication
                if (response.status === 401) {
                    const token = await getBroadcasterToken()
                    const clientId = process.env.KICK_CLIENT_ID

                    const headers: Record<string, string> = {
                        'Authorization': `Bearer ${token}`,
                        'Accept': 'application/json',
                        'Content-Type': 'application/json',
                    }

                    if (clientId) {
                        headers['Client-Id'] = clientId
                    }

                    response = await fetch(url, { headers })
                }

                if (response && response.ok) {
                    const channelData: any = await response.json()

                    if (Array.isArray(channelData.data)) {
                        channelData.data.forEach((channel: any) => {
                            if (channel.slug && channel.broadcaster_user_id) {
                                slugToBroadcasterId.set(channel.slug.toLowerCase(), channel.broadcaster_user_id)
                                if (channel.id) {
                                    slugToChannelId.set(channel.slug.toLowerCase(), channel.id)
                                }
                            }
                        })
                    }
                } else {
                    console.warn(`[Kick API] Failed to batch fetch channels: ${response?.status || 'no response'}`)
                }
            } catch (error) {
                console.error(`[Kick API] Error batch fetching channels:`, error)
            }

            // Small delay between batches
            if (i + channelBatchSize < channelSlugs.length) {
                await new Promise(resolve => setTimeout(resolve, 100))
            }
        }

        // Step 2: Batch fetch livestreams using broadcaster_user_ids (up to 50 at once)
        const broadcasterIds = Array.from(slugToBroadcasterId.values())

        if (broadcasterIds.length === 0) {
            console.warn(`[Kick API] No broadcaster_user_ids found for any channels`)
            // Fallback to individual fetches
            return await syncThumbnailsFallback(channelSlugs)
        }

        const livestreamBatchSize = 50
        for (let i = 0; i < broadcasterIds.length; i += livestreamBatchSize) {
            const batch = broadcasterIds.slice(i, i + livestreamBatchSize)

            try {
                const livestreamsData = await getLivestreams({
                    broadcaster_user_id: batch,
                    limit: 100,
                })

                // Map livestreams back to slugs using broadcaster_user_id or slug
                livestreamsData.forEach(livestream => {
                    // First try to match by slug (most reliable)
                    if (livestream.channelSlug) {
                        const matchingSlug = channelSlugs.find(s => s.toLowerCase() === livestream.channelSlug.toLowerCase())
                        if (matchingSlug) {
                            results.set(matchingSlug, livestream.thumbnailUrl)
                            return
                        }
                    }

                    // Fallback: match by broadcaster_user_id
                    const broadcasterIdStr = livestream.streamId
                    for (const [slug, broadcasterId] of slugToBroadcasterId.entries()) {
                        if (broadcasterId.toString() === broadcasterIdStr) {
                            results.set(slug, livestream.thumbnailUrl)
                            break
                        }
                    }
                })
            } catch (error) {
                console.error(`[Kick API] Error batch fetching livestreams:`, error)
            }

            // Small delay between batches
            if (i + livestreamBatchSize < broadcasterIds.length) {
                await new Promise(resolve => setTimeout(resolve, 100))
            }
        }

        // Step 3: Ensure all slugs have a result (set null for missing ones)
        channelSlugs.forEach(slug => {
            if (!results.has(slug)) {
                results.set(slug, null)
            }
        })

        console.log(`[Kick API] Synced thumbnails for ${results.size} channels (${Array.from(results.values()).filter(v => v !== null).length} with thumbnails)`)

    } catch (error) {
        console.error(`[Kick API] Error in syncThumbnailsForActiveStreams:`, error)
        // Fallback to individual fetches
        return await syncThumbnailsFallback(channelSlugs)
    }

    return results
}

/**
 * Fallback: Fetch thumbnails one by one (used if batch fetch fails)
 */
async function syncThumbnailsFallback(
    channelSlugs: string[]
): Promise<Map<string, string | null>> {
    const results = new Map<string, string | null>()

    console.log(`[Kick API] Using fallback: fetching thumbnails individually`)

    const batchSize = 5
    for (let i = 0; i < channelSlugs.length; i += batchSize) {
        const batch = channelSlugs.slice(i, i + batchSize)
        const batchPromises = batch.map(async (slug) => {
            try {
                const data = await getChannelWithLivestream(slug)
                results.set(slug, data?.thumbnailUrl || null)
            } catch (error) {
                console.error(`Failed to sync thumbnail for ${slug}:`, error)
                results.set(slug, null)
            }
        })

        await Promise.all(batchPromises)

        // Small delay between batches to avoid rate limits
        if (i + batchSize < channelSlugs.length) {
            await new Promise(resolve => setTimeout(resolve, 100))
        }
    }

    return results
}

/**
 * Get users by user IDs from Kick Users API
 * Fetches email, name, and profile_picture
 * Requires authentication (User Access Token)
 * Can fetch up to 50 users at once
 *
 * RATE LIMITED: Uses global rate limiter to prevent API hammering
 */
export async function getUsersByIds(userIds: number[]): Promise<Map<number, KickUser>> {
    const result = new Map<number, KickUser>()

    if (userIds.length === 0) {
        return result
    }

    try {
        // Batch fetch in chunks of 50 (API limit)
        const batchSize = 50
        for (let i = 0; i < userIds.length; i += batchSize) {
            const batch = userIds.slice(i, i + batchSize)

            const params = new URLSearchParams()
            batch.forEach(id => {
                params.append('user_id[]', id.toString())
            })

            const endpoint = `/users?${params.toString()}`
            const url = `${KICK_API_BASE}${endpoint}`

            const clientId = process.env.KICK_CLIENT_ID
            let token = await getBroadcasterToken()
            let retryCount = 0
            const maxRetries = 3 // Reduced retries - rely on global backoff instead
            let batchSuccess = false

            // Retry loop for handling 401 and 429 errors
            while (retryCount <= maxRetries && !batchSuccess) {
                // ACQUIRE RATE LIMIT SLOT - This is the key change
                const releaseSlot = await acquireRateLimitSlot()

                try {
                    const headers: Record<string, string> = {
                        'Authorization': `Bearer ${token}`,
                        'Accept': 'application/json',
                        'Content-Type': 'application/json',
                    }

                    if (clientId) {
                        headers['Client-Id'] = clientId
                    }

                    const response = await fetch(url, { headers })

                    if (response.ok) {
                        const apiResponse: { data: KickUser[] } = await response.json()

                        if (apiResponse.data && Array.isArray(apiResponse.data)) {
                            apiResponse.data.forEach(user => {
                                result.set(user.user_id, user)
                            })
                        }
                        batchSuccess = true
                    } else if (response.status === 429) {
                        // Rate limited - check for standard rate limit headers
                        const retryAfter = response.headers.get('Retry-After')
                        const rateLimitRemaining = response.headers.get('X-RateLimit-Remaining')
                        const rateLimitLimit = response.headers.get('X-RateLimit-Limit')
                        const rateLimitReset = response.headers.get('X-RateLimit-Reset')

                        // Calculate wait time - prefer Retry-After header (RFC 7231)
                        let baseWaitTime = 5000 // Default 5 seconds
                        if (retryAfter) {
                            baseWaitTime = parseInt(retryAfter, 10) * 1000
                        } else if (rateLimitReset) {
                            // Calculate wait time until reset
                            const resetTime = parseInt(rateLimitReset, 10) * 1000
                            baseWaitTime = Math.max(0, resetTime - Date.now()) + 1000 // Add 1s buffer
                        }

                        // Log rate limit info if available
                        if (rateLimitLimit && rateLimitRemaining) {
                            console.warn(`[Kick API] Rate limited (429) - Limit: ${rateLimitLimit}, Remaining: ${rateLimitRemaining}, Reset: ${rateLimitReset || 'unknown'}`)
                        }

                        // Exponential backoff with jitter (max 60 seconds)
                        const waitTime = Math.min(baseWaitTime * Math.pow(2, retryCount) + Math.random() * 1000, 60000)

                        // Trigger global backoff - all other requests will wait too
                        triggerGlobalBackoff(waitTime)

                        if (retryCount < maxRetries) {
                            console.warn(`[Kick API] Rate limited (429), global backoff ${waitTime}ms, retry ${retryCount + 1}/${maxRetries}`)
                            await new Promise(resolve => setTimeout(resolve, waitTime))
                            retryCount++
                            continue
                        } else {
                            console.warn(`[Kick API] Rate limit exceeded after ${maxRetries} retries, skipping batch`)
                            break
                        }
                    } else if (response.status === 401 && retryCount < maxRetries) {
                        // Token expired - try to refresh
                        console.warn(`[Kick API] Got 401 for users batch, attempting token refresh (attempt ${retryCount + 1})`)
                        clearTokenCache()

                        const refreshedToken = await refreshBroadcasterToken()
                        if (refreshedToken) {
                            token = refreshedToken
                            retryCount++
                            await new Promise(resolve => setTimeout(resolve, 1000))
                            continue
                        } else {
                            console.warn(`[Kick API] Token refresh failed, falling back to app token`)
                            clearTokenCache()
                            token = await getBroadcasterToken()
                            retryCount++
                            await new Promise(resolve => setTimeout(resolve, 1000))
                            continue
                        }
                    } else if (response.status === 404) {
                        // 404 - endpoint might be wrong or users don't exist
                        console.debug(`[Kick API] 404 for users batch, skipping`)
                        break
                    } else {
                        const errorText = await response.text().catch(() => 'Unknown error')
                        console.warn(`[Kick API] Failed to fetch users batch: ${response.status} ${errorText.substring(0, 100)}`)
                        break
                    }
                } finally {
                    // ALWAYS release the slot
                    releaseSlot()
                }
            }
        }
    } catch (error) {
        console.error(`[Kick API] Error fetching users by IDs:`, error instanceof Error ? error.message : 'Unknown error')
    }

    return result
}

/**
 * Get user info from channel API by username/slug
 * Fetches profile picture and bio if available
 * Uses the legacy v2 API which has more user info
 * Fallback when Users API doesn't have the user
 */
export async function getUserInfoBySlug(slug: string): Promise<{
    profile_picture_url: string | null
    bio: string | null
} | null> {
    try {
        // Use legacy v2 API which has user info
        const url = `https://kick.com/api/v2/channels/${slug.toLowerCase()}`

        const response = await fetch(url, {
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            },
        })

        if (!response.ok) {
            return null
        }

        const channelData: any = await response.json()

        // Extract profile picture from user object
        let profilePicture: string | null = null
        if (channelData.user?.profile_picture) {
            profilePicture = channelData.user.profile_picture
        } else if (channelData.user?.profilepicture) {
            profilePicture = channelData.user.profilepicture
        }

        // Extract bio
        const bio = channelData.user?.bio || channelData.bio || null

        return {
            profile_picture_url: profilePicture,
            bio: bio,
        }
    } catch (error) {
        console.debug(`[Kick API] Error fetching user info for ${slug}:`, error)
        return null
    }
}

/**
 * Clear cached token (useful for testing or forced refresh)
 */
export function clearTokenCache(): void {
    cachedToken = null
}

/**
 * Get moderator's User Access Token from database
 * Used for moderation actions (ban/timeout) and chat messages
 */
export async function getModeratorToken(): Promise<string | null> {
    const MODERATOR_USERNAME = process.env.KICK_MODERATOR_USERNAME || 'sweetflipsbot'
    
    try {
        console.log(`[Kick API] Looking for moderator token for: ${MODERATOR_USERNAME}`)

        const moderator = await (db as any).user.findFirst({
            where: {
                username: {
                    equals: MODERATOR_USERNAME,
                    mode: 'insensitive',
                },
            },
            select: {
                access_token_encrypted: true,
                refresh_token_encrypted: true,
                username: true,
                kick_user_id: true,
            },
        })

        if (!moderator?.access_token_encrypted) {
            console.warn(`[Kick API] No encrypted token found for moderator: ${MODERATOR_USERNAME}`)
            return null
        }

        try {
            const accessToken = decryptToken(moderator.access_token_encrypted)
            console.log(`[Kick API] Successfully retrieved token for moderator: ${moderator.username}`)
            return accessToken
        } catch (decryptError) {
            console.warn(`[Kick API] Failed to decrypt moderator token:`, decryptError instanceof Error ? decryptError.message : 'Unknown error')
            
            // Try to refresh if we have a refresh token
            if (moderator.refresh_token_encrypted) {
                const { clientId, clientSecret } = getKickBotCredentials()
                const redirectUri = process.env.KICK_REDIRECT_URI || 'http://localhost:3000/api/auth/callback'

                try {
                    const refreshToken = decryptToken(moderator.refresh_token_encrypted)
                    const params = new URLSearchParams({
                        grant_type: 'refresh_token',
                        client_id: clientId,
                        client_secret: clientSecret,
                        refresh_token: refreshToken,
                        redirect_uri: redirectUri,
                    })

                    const response = await fetch(KICK_AUTH_URL, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/x-www-form-urlencoded',
                        },
                        body: params.toString(),
                    })

                    if (response.ok) {
                        const data: AppAccessTokenResponse & { refresh_token?: string } = await response.json()
                        
                        // Update tokens in database
                        await (db as any).user.update({
                            where: { kick_user_id: moderator.kick_user_id },
                            data: {
                                access_token_hash: hashToken(data.access_token),
                                refresh_token_hash: data.refresh_token ? hashToken(data.refresh_token) : undefined,
                                access_token_encrypted: encryptToken(data.access_token),
                                ...(data.refresh_token && {
                                    refresh_token_encrypted: encryptToken(data.refresh_token),
                                }),
                            },
                        })

                        console.log(`[Kick API] Successfully refreshed moderator token`)
                        return data.access_token
                    } else {
                        const errorText = await response.text()
                        console.warn(`[Kick API] Moderator token refresh failed: ${response.status} ${errorText}`)
                    }
                } catch (refreshError) {
                    console.error(`[Kick API] Error refreshing moderator token:`, refreshError instanceof Error ? refreshError.message : 'Unknown error')
                }
            }
            
            return null
        }
    } catch (dbError) {
        console.warn(`[Kick API] Error fetching moderator from database:`, dbError instanceof Error ? dbError.message : 'Unknown error')
        return null
    }
}

/**
 * Ban or timeout a user from a channel
 */
export async function moderationBan(params: {
    broadcaster_user_id: number | bigint
    user_id: number | bigint
    duration_seconds?: number
    reason?: string
}): Promise<{ success: boolean; error?: string }> {
    const releaseSlot = await acquireRateLimitSlot()
    
    try {
        const moderatorToken = await getModeratorToken()
        if (!moderatorToken) {
            return { success: false, error: 'Moderator token not available. Ensure moderator account is authorized with moderation:ban scope.' }
        }

        const clientId = process.env.KICK_CLIENT_ID
        const headers: Record<string, string> = {
            'Authorization': `Bearer ${moderatorToken}`,
            'Content-Type': 'application/json',
        }

        if (clientId) {
            headers['Client-Id'] = clientId
        }

        const body: any = {
            broadcaster_user_id: typeof params.broadcaster_user_id === 'bigint' 
                ? params.broadcaster_user_id.toString() 
                : params.broadcaster_user_id,
            user_id: typeof params.user_id === 'bigint' 
                ? params.user_id.toString() 
                : params.user_id,
        }

        if (params.duration_seconds !== undefined) {
            body.duration = params.duration_seconds
        }

        if (params.reason) {
            body.reason = params.reason
        }

        const response = await fetch(`${KICK_API_BASE}/moderation/ban`, {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
        })

        if (!response.ok) {
            const errorText = await response.text()
            
            if (response.status === 429) {
                const retryAfter = response.headers.get('Retry-After')
                const backoffMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : 60000
                triggerGlobalBackoff(backoffMs)
            }
            
            return { success: false, error: `Kick API error: ${response.status} ${errorText}` }
        }

        console.log(`[Kick API] Successfully ${params.duration_seconds ? 'timed out' : 'banned'} user ${params.user_id} from channel ${params.broadcaster_user_id}`)
        return { success: true }
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        console.error(`[Kick API] Error banning user:`, errorMessage)
        return { success: false, error: errorMessage }
    } finally {
        releaseSlot()
    }
}

/**
 * Send a chat message as the moderator bot
 * @param broadcaster_user_id - The broadcaster's user ID
 * @param content - Message content (max 500 chars)
 * @param type - Message type: 'user' or 'bot' (default: 'bot')
 */
export async function sendModeratorChatMessage(params: {
    broadcaster_user_id: number | bigint
    content: string
    type?: 'user' | 'bot'
}): Promise<{ success: boolean; error?: string }> {
    const releaseSlot = await acquireRateLimitSlot()
    
    try {
        const moderatorToken = await getModeratorToken()
        if (!moderatorToken) {
            return { success: false, error: 'Moderator token not available. Ensure moderator account is authorized.' }
        }

        if (!params.content || !params.content.trim()) {
            return { success: false, error: 'Message content is required' }
        }

        if (params.content.length > 500) {
            return { success: false, error: 'Message content cannot exceed 500 characters' }
        }

        const clientId = process.env.KICK_CLIENT_ID
        const headers: Record<string, string> = {
            'Authorization': `Bearer ${moderatorToken}`,
            'Content-Type': 'application/json',
        }

        if (clientId) {
            headers['Client-Id'] = clientId
        }

        const body = {
            broadcaster_user_id: typeof params.broadcaster_user_id === 'bigint' 
                ? params.broadcaster_user_id.toString() 
                : params.broadcaster_user_id,
            content: params.content.trim(),
            type: params.type || 'bot',
        }

        const response = await fetch(`${KICK_API_BASE}/chat`, {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
        })

        if (!response.ok) {
            const errorText = await response.text()
            
            if (response.status === 429) {
                const retryAfter = response.headers.get('Retry-After')
                const backoffMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : 60000
                triggerGlobalBackoff(backoffMs)
            }
            
            if (response.status === 500) {
                try {
                    const errorJson = JSON.parse(errorText)
                    const errorData = errorJson.data || errorJson.error || ''
                    if (typeof errorData === 'string' && errorData.includes('SLOW_MODE_ERROR')) {
                        return { success: false, error: 'Slow mode active - message sent too quickly' }
                    }
                } catch {
                    // Not JSON, continue with normal error
                }
            }
            
            return { success: false, error: `Kick API error: ${response.status} ${errorText}` }
        }

        console.log(`[Kick API] Successfully sent chat message: ${params.content.substring(0, 50)}...`)
        return { success: true }
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        console.error(`[Kick API] Error sending chat message:`, errorMessage)
        return { success: false, error: errorMessage }
    } finally {
        releaseSlot()
    }
}
