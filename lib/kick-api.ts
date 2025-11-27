/**
 * Kick Dev API Client
 *
 * Handles authentication and API calls to the official Kick Dev API.
 * Uses broadcaster's User Access Token from database for API calls.
 */

import { db } from '@/lib/db'
import { decryptToken, encryptToken } from '@/lib/encryption'

// Kick Dev API endpoints
// Base URL for Kick Dev API v1 (public endpoint)
const KICK_API_BASE = process.env.KICK_API_BASE || 'https://api.kick.com/public/v1'
// OAuth token endpoint (hosted on id.kick.com)
const KICK_AUTH_URL = process.env.KICK_AUTH_URL || 'https://id.kick.com/oauth/token'
// Broadcaster channel slug to use for API calls
const BROADCASTER_SLUG = process.env.KICK_CHANNEL_SLUG || 'sweetflips'

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

interface KickLivestream {
    id: number
    slug: string
    channel_id: number
    session_title: string | null
    is_live: boolean
    thumbnail: KickThumbnail | null
    viewer_count: number
    created_at: string
    duration?: number
}

interface KickChannel {
    id: number
    user_id: number
    slug: string
    livestream: KickLivestream | null
    thumbnail?: string | KickThumbnail | null
}

interface StreamThumbnail {
    streamId: string
    channelSlug: string
    thumbnailUrl: string | null
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

/**
 * Get broadcaster's User Access Token from database
 * Falls back to App Access Token if user token not available
 */
async function getBroadcasterToken(): Promise<string> {
    // Check if cached token is still valid (with 5 minute buffer)
    if (cachedToken && cachedToken.expiresAt > Date.now() + 5 * 60 * 1000) {
        console.log(`[Kick API] Using cached ${cachedToken.source} token`)
        return cachedToken.token
    }

    // Try to get broadcaster's token from database
    try {
        console.log(`[Kick API] Looking for broadcaster token for: ${BROADCASTER_SLUG}`)

        const broadcaster = await db.user.findFirst({
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
async function refreshBroadcasterToken(): Promise<string | null> {
    try {
        const broadcaster = await db.user.findFirst({
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
        const clientId = process.env.KICK_CLIENT_ID
        const clientSecret = process.env.KICK_CLIENT_SECRET

        if (!clientId || !clientSecret) {
            console.warn(`[Kick API] KICK_CLIENT_ID and KICK_CLIENT_SECRET required for token refresh`)
            return null
        }

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

        // Update tokens in database
        await db.user.update({
            where: { kick_user_id: broadcaster.kick_user_id },
            data: {
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
async function getAppAccessToken(): Promise<string> {
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

            const headers: HeadersInit = {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                ...options.headers,
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
 * Uses GET /public/v1/channels?slug={slug} endpoint
 * Tries without auth first, then with auth if needed
 */
export async function getChannelWithLivestream(slug: string): Promise<StreamThumbnail | null> {
    try {
        const startTime = Date.now()
        console.log(`[Kick API] Fetching channel data for: ${slug}`)

        const endpoint = `/channels?slug=${encodeURIComponent(slug)}`
        const url = `${KICK_API_BASE}${endpoint}`

        // Try without authentication first (public endpoint might not require auth)
        let response = await fetch(url, {
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

            const headers: HeadersInit = {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/json',
                'Content-Type': 'application/json',
            }

            if (clientId) {
                headers['Client-Id'] = clientId
            }

            response = await fetch(url, { headers })
        }

        if (!response.ok) {
            const errorText = await response.text()
            throw new Error(`Kick API error: ${response.status} ${errorText}`)
        }

        const channel: KickChannel = await response.json()
        const duration = Date.now() - startTime

        console.log(`[Kick API] Fetched channel ${slug} in ${duration}ms`)
        console.log(`[Kick API] Channel data:`, JSON.stringify({
            id: channel.id,
            slug: channel.slug,
            hasLivestream: !!channel.livestream,
            livestreamIsLive: channel.livestream?.is_live,
        }))

        // Check if channel has livestream
        const livestream = channel.livestream
        if (!livestream || !livestream.is_live) {
            console.log(`[Kick API] Channel ${slug} has no active livestream`)
            return null
        }

        // Extract thumbnail from livestream or channel
        let thumbnailUrl: string | null = null

        if (livestream.thumbnail) {
            thumbnailUrl = extractThumbnailUrl(livestream.thumbnail)
            console.log(`[Kick API] Extracted thumbnail from livestream object`)
        } else if (channel.thumbnail) {
            thumbnailUrl = extractThumbnailUrl(channel.thumbnail)
            console.log(`[Kick API] Extracted thumbnail from channel object`)
        }

        if (thumbnailUrl) {
            console.log(`[Kick API] Found thumbnail for ${slug}: ${thumbnailUrl.substring(0, 80)}...`)
        } else {
            console.warn(`[Kick API] No thumbnail found for channel ${slug} (livestream ID: ${livestream.id})`)
        }

        return {
            streamId: livestream.id.toString(),
            channelSlug: slug,
            thumbnailUrl,
            fetchedAt: new Date(),
        }
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
 */
export async function getLivestreams(filters?: {
    broadcaster_user_id?: number[]
    limit?: number
}): Promise<StreamThumbnail[]> {
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

        const response: { data: KickLivestream[] } = await kickApiRequest(endpoint)

        return response.data.map(livestream => ({
            streamId: livestream.id.toString(),
            channelSlug: '', // Will need to be populated from channel_id lookup if needed
            thumbnailUrl: extractThumbnailUrl(livestream.thumbnail),
            fetchedAt: new Date(),
        }))
    } catch (error) {
        console.error('Error fetching livestreams:', error)
        return []
    }
}

/**
 * Sync thumbnails for active streams
 * Fetches thumbnails for all active stream sessions
 */
export async function syncThumbnailsForActiveStreams(
    channelSlugs: string[]
): Promise<Map<string, string | null>> {
    const results = new Map<string, string | null>()

    // Process in parallel with rate limiting (max 5 concurrent)
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
 * Clear cached token (useful for testing or forced refresh)
 */
export function clearTokenCache(): void {
    cachedToken = null
}
