import { db } from '@/lib/db';
import { getBroadcasterToken, refreshBroadcasterToken, clearTokenCache, getAppAccessToken, acquireRateLimitSlot } from '@/lib/kick-api';
import { getOrCreateActiveSession, endActiveSession, getActiveSession, touchSession, updateSessionMetadata } from '@/lib/stream-session-manager';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic'

// Kick Dev API base URL
const KICK_API_BASE = process.env.KICK_API_BASE || 'https://api.kick.com/public/v1'

const MAX_RETRIES = 3
const INITIAL_RETRY_DELAY = 1000 // 1 second

// Exponential backoff helper
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

// In-memory cache for channel data (5-10 second TTL)
const channelCache = new Map<string, {
    data: any
    expiresAt: number
}>()

const CACHE_TTL_MS = 15000 // 15 seconds - balance between freshness and rate limiting

// Persistent cache for follower count (survives API failures)
const followerCountCache = new Map<string, {
    count: number
    updatedAt: number
}>()
const FOLLOWER_CACHE_TTL_MS = 3600000 // 1 hour - fallback when API fails

// In-flight request tracking to prevent duplicate concurrent requests
const inFlightRequests = new Map<string, Promise<any>>()

function getCachedChannelData(slug: string): any | null {
    const cached = channelCache.get(slug.toLowerCase())
    if (cached && cached.expiresAt > Date.now()) {
        return cached.data
    }
    if (cached) {
        channelCache.delete(slug.toLowerCase())
    }
    return null
}

function setCachedChannelData(slug: string, data: any): void {
    channelCache.set(slug.toLowerCase(), {
        data,
        expiresAt: Date.now() + CACHE_TTL_MS,
    })

    // Clean up expired entries periodically (keep cache size reasonable)
    if (channelCache.size > 100) {
        const now = Date.now()
        for (const [key, value] of channelCache.entries()) {
            if (value.expiresAt <= now) {
                channelCache.delete(key)
            }
        }
    }
}

/**
 * Parse v2 API response into structured data
 */
function parseV2ChannelData(data: any): {
    followers_count: number
    viewer_count: number
    stream_title: string
    category: { id: number; name: string } | null
    is_live: boolean
    started_at: string | null
    thumbnail: string | null
    broadcaster_user_id?: number
    chatroom_id?: number
} | null {
    try {
        const livestream = data.livestream
        const chatroom = data.chatroom
        let category: { id: number; name: string } | null = null

        // Extract category from livestream
        if (livestream?.category && typeof livestream.category === 'object') {
            category = {
                id: livestream.category.id,
                name: livestream.category.name
            }
        }
        // Or from categories array
        if (!category && livestream?.categories && Array.isArray(livestream.categories) && livestream.categories.length > 0) {
            const firstCat = livestream.categories[0]
            category = {
                id: firstCat.id || firstCat.category_id,
                name: firstCat.name
            }
        }

        // Extract thumbnail
        let thumbnail: string | null = null
        if (livestream?.thumbnail) {
            if (typeof livestream.thumbnail === 'string') {
                thumbnail = livestream.thumbnail
            } else if (typeof livestream.thumbnail === 'object' && livestream.thumbnail.url) {
                thumbnail = livestream.thumbnail.url
            }
        }

        return {
            followers_count: data.followers_count || data.followersCount || 0,
            viewer_count: livestream?.viewer_count || 0,
            stream_title: livestream?.session_title || livestream?.stream_title || '',
            category,
            is_live: normalizeIsLiveFlag(livestream?.is_live),
            started_at: livestream?.started_at || null,
            thumbnail,
            broadcaster_user_id: data.broadcaster_user_id || data.user?.id || data.id,
            chatroom_id: chatroom?.id || data.chatroom_id,
        }
    } catch (error) {
        return null
    }
}

// Normalize livestream.is_live flag from Kick API to a strict boolean.
// Kick has changed response formats in the past (boolean, number, string),
// so we defensively coerce here and default to "offline" for unknown values
// to avoid false positives where the dashboard shows LIVE while actually offline.
function normalizeIsLiveFlag(raw: unknown): boolean {
    if (typeof raw === 'boolean') return raw
    if (typeof raw === 'number') return raw !== 0
    if (typeof raw === 'string') {
        const value = raw.trim().toLowerCase()
        if (['true', '1', 'yes', 'live', 'online'].includes(value)) return true
        if (['false', '0', 'no', 'offline'].includes(value)) return false
    }

    if (raw === null || raw === undefined) return false

    console.warn('[Channel API] Unexpected is_live value from Kick v2 API, treating as offline:', {
        value: raw,
        type: typeof raw,
    })
    // Be conservative: assume offline on unexpected formats to prevent stuck LIVE status
    return false
}

/**
 * Check live status using official Kick API /livestreams endpoint (authoritative source)
 * According to docs.kick.com/apis/livestreams:
 * - If endpoint returns data array with items, stream is LIVE
 * - If endpoint returns empty array, stream is OFFLINE
 * This is more reliable than checking is_live flag which may be missing or undefined
 *
 * Returns isLive status, started_at, and thumbnail from authoritative /livestreams endpoint
 */
async function checkLiveStatusFromAPI(slug: string, broadcasterUserId?: number): Promise<{
    isLive: boolean
    startedAt?: string | null
    thumbnailUrl?: string | null
}> {

    try {
        // First, try the official /livestreams endpoint if we have broadcaster_user_id
        // This is the authoritative source for live status
        // Note: The API filter is unreliable, so we fetch all livestreams and filter client-side
        if (broadcasterUserId) {
            // Don't rely on API filter - fetch recent livestreams and filter ourselves
            const livestreamsUrl = `${KICK_API_BASE}/livestreams?limit=100`

            // Acquire rate limit slot before making request
            const releaseSlot = await acquireRateLimitSlot()
            try {
                // Try without auth first
                let livestreamsResponse = await fetch(livestreamsUrl, {
                    headers: {
                        'Accept': 'application/json',
                        'Content-Type': 'application/json',
                    },
                    cache: 'no-store',
                })

                // If 401, retry with authentication
                if (livestreamsResponse.status === 401) {
                    try {
                        const token = await getBroadcasterToken()
                        const clientId = process.env.KICK_CLIENT_ID

                        const authHeaders: Record<string, string> = {
                            'Authorization': `Bearer ${token}`,
                            'Accept': 'application/json',
                            'Content-Type': 'application/json',
                        }
                        if (clientId) {
                            authHeaders['Client-Id'] = clientId
                        }

                        livestreamsResponse = await fetch(livestreamsUrl, {
                            headers: authHeaders,
                            cache: 'no-store',
                        })
                    } catch (authError) {
                        console.warn(`[Channel API] Failed to get auth token:`, authError instanceof Error ? authError.message : 'Unknown error')
                    }
                }

                if (livestreamsResponse.ok) {
                    const livestreamsData = await livestreamsResponse.json()

                    if (!Array.isArray(livestreamsData.data)) {
                        console.warn('[Channel API] Unexpected /livestreams response shape, falling back to /channels:', {
                            hasData: 'data' in livestreamsData,
                            dataType: typeof livestreamsData.data,
                        })
                    } else if (livestreamsData.data.length === 0) {
                        // Empty data array means stream is OFFLINE
                        return { isLive: false }
                    } else {
                        // Non-empty array means *something* is live, but the API filter is known to be unreliable.
                        // We must only treat the channel as live if we can find a matching livestream entry.
                        const slugLower = slug.toLowerCase()
                        const broadcasterIdStr = String(broadcasterUserId)

                        // Try to find matching livestream - check multiple field variations
                        const livestream = livestreamsData.data.find((ls: any) => {
                            const lsBroadcaster = ls?.broadcaster_user_id
                            const lsSlug = typeof ls?.slug === 'string' ? ls.slug.toLowerCase() : null
                            const lsChannelSlug = typeof ls?.channel_slug === 'string' ? ls.channel_slug.toLowerCase() : null
                            const lsChannelSlugAlt = typeof ls?.channel?.slug === 'string' ? ls.channel.slug.toLowerCase() : null
                            const lsChannelId = ls?.channel_id

                            // Match by broadcaster ID (most reliable)
                            if (String(lsBroadcaster) === broadcasterIdStr) {
                                return true
                            }

                            // Match by slug variations
                            if (lsSlug === slugLower || lsChannelSlug === slugLower || lsChannelSlugAlt === slugLower) {
                                return true
                            }

                            return false
                        }) as any | undefined

                        if (livestream) {
                            // Extract started_at and thumbnail from authoritative source
                            const startedAt = livestream.started_at || null
                            let thumbnailUrl: string | null = null
                            if (livestream.thumbnail) {
                                thumbnailUrl = typeof livestream.thumbnail === 'string'
                                    ? livestream.thumbnail
                                    : livestream.thumbnail.url || null
                            }
                            console.log(`[Channel API] Found matching livestream for ${slug} (broadcaster: ${broadcasterUserId})`)
                            return { isLive: true, startedAt, thumbnailUrl }
                        }

                        // Filter mismatch: don't assume live. Fall back to /channels to avoid false-positive LIVE state.
                        // Log detailed info for debugging
                        const sampleFields = livestreamsData.data.slice(0, 3).map((ls: any) => ({
                            broadcaster_user_id: ls?.broadcaster_user_id,
                            slug: ls?.slug,
                            channel_slug: ls?.channel_slug,
                            channel_id: ls?.channel_id,
                            channel: ls?.channel ? { slug: ls.channel.slug, id: ls.channel.id } : null,
                            allKeys: Object.keys(ls || {}).slice(0, 10), // First 10 keys for debugging
                        }))

                        // Check if sweetflips might be in the full list with different field structure
                        type LivestreamSlugInfo = {
                            broadcaster: unknown
                            slug: string | null
                            channel_slug: string | null
                            channel_slug_alt: string | null
                        }

                        const allSlugs: LivestreamSlugInfo[] = livestreamsData.data.map((ls: any): LivestreamSlugInfo => ({
                            broadcaster: ls?.broadcaster_user_id,
                            slug: typeof ls?.slug === 'string' ? ls.slug : null,
                            channel_slug: typeof ls?.channel_slug === 'string' ? ls.channel_slug : null,
                            channel_slug_alt: typeof ls?.channel?.slug === 'string' ? ls.channel.slug : null,
                        }))
                        const potentialMatch = allSlugs.find((s: LivestreamSlugInfo) =>
                            String(s.broadcaster) === broadcasterIdStr ||
                            s.slug?.toLowerCase() === slugLower ||
                            s.channel_slug?.toLowerCase() === slugLower ||
                            s.channel_slug_alt?.toLowerCase() === slugLower
                        )

                        console.warn('[Channel API] /livestreams returned items but none match requested broadcaster/slug; falling back to /channels.', {
                            requested: { slug, broadcasterUserId },
                            sample: sampleFields,
                            totalReturned: livestreamsData.data.length,
                            potentialMatch: potentialMatch || 'none found',
                            allBroadcasterIds: [...new Set(livestreamsData.data.map((ls: any) => ls?.broadcaster_user_id))].slice(0, 10),
                        })
                    }
                } else {
                    console.warn(`[Channel API] /livestreams endpoint returned ${livestreamsResponse.status}`)
                }
            } finally {
                releaseSlot()
            }
        }

        // Fallback: Use official /channels endpoint with auth
        const channelsUrl = `${KICK_API_BASE}/channels?slug[]=${encodeURIComponent(slug)}`

        try {
            // Acquire rate limit slot before making request
            const releaseSlot = await acquireRateLimitSlot()
            try {
                const token = await getBroadcasterToken()
                const clientId = process.env.KICK_CLIENT_ID

                const authHeaders: Record<string, string> = {
                    'Authorization': `Bearer ${token}`,
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                }
                if (clientId) {
                    authHeaders['Client-Id'] = clientId
                }

                const response = await fetch(channelsUrl, {
                    headers: authHeaders,
                    cache: 'no-store',
                })

                if (!response.ok) {
                    console.warn(`[Channel API] /channels endpoint returned ${response.status}`)
                    return { isLive: false }
                }

                const responseData = await response.json()

                // Parse response - format is { data: [channel] }
                let channel = null
                if (Array.isArray(responseData.data) && responseData.data.length > 0) {
                    channel = responseData.data[0]
                } else if (responseData.data && typeof responseData.data === 'object') {
                    channel = responseData.data
                }

                if (!channel) {
                    console.log(`[Channel API] /channels returned no channel data`)
                    return { isLive: false }
                }

                // Check stream.is_live from /channels endpoint (normalize to avoid truthy "0"/"false")
                const stream = channel.stream
                if (!stream || !normalizeIsLiveFlag(stream.is_live)) {
                    return { isLive: false }
                }

                // Extract started_at and thumbnail if available from channel data
                const livestream = channel.livestream
                const startedAt = livestream?.started_at || null
                let thumbnailUrl: string | null = null
                if (livestream?.thumbnail) {
                    thumbnailUrl = typeof livestream.thumbnail === 'string'
                        ? livestream.thumbnail
                        : livestream.thumbnail.url || null
                }

                return { isLive: true, startedAt, thumbnailUrl }
            } finally {
                releaseSlot()
            }
        } catch (fallbackError) {
            console.warn(`[Channel API] Fallback /channels failed:`, fallbackError instanceof Error ? fallbackError.message : 'Unknown error')
            return { isLive: false }
        }
    } catch (error) {
        console.warn(`[Channel API] Failed to check API:`, error instanceof Error ? error.message : 'Unknown error')
        return { isLive: false }
    }
}

/**
 * Fetch v2 API data with deduplication - returns parsed data directly
 */
async function fetchV2ChannelDataWithDedup(slug: string): Promise<{
    followers_count: number
    viewer_count: number
    stream_title: string
    category: { id: number; name: string } | null
    is_live: boolean
    started_at: string | null
    thumbnail: string | null
    broadcaster_user_id?: number
    rawData?: any
} | null> {
    const cacheKey = `v2:${slug.toLowerCase()}`

    // Check if there's already an in-flight request for this slug
    const inFlight = inFlightRequests.get(cacheKey)
    if (inFlight) {
        return inFlight
    }

    // Create new request promise
    const requestPromise = (async () => {
        try {
            const url = `https://kick.com/api/v2/channels/${slug.toLowerCase()}`
            const releaseSlot = await acquireRateLimitSlot()
            try {
                const controller = new AbortController()
                const timeoutId = setTimeout(() => controller.abort(), 10000) // Increased to 10s

                const response = await fetch(url, {
                    headers: {
                        'Accept': 'application/json',
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    },
                    signal: controller.signal,
                    cache: 'no-store',
                })

                clearTimeout(timeoutId)

                if (!response.ok) {
                    console.warn(`[Channel API] v2 API returned ${response.status} for ${slug}`)
                    return null
                }

                const data = await response.json()
                const parsed = parseV2ChannelData(data)
                if (parsed) {
                    // Cache follower count for fallback during API failures
                    if (parsed.followers_count > 0) {
                        followerCountCache.set(slug.toLowerCase(), {
                            count: parsed.followers_count,
                            updatedAt: Date.now(),
                        })
                    }
                    return { ...parsed, rawData: data }
                }
                console.warn(`[Channel API] v2 API returned unparseable data for ${slug}`)
                return null
            } finally {
                releaseSlot()
            }
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Unknown error'
            const isTimeout = error instanceof Error && error.name === 'AbortError'
            console.warn(`[Channel API] v2 API ${isTimeout ? 'timeout' : 'error'} for ${slug}: ${errorMsg}`)
            return null
        } finally {
            // Remove from in-flight requests
            inFlightRequests.delete(cacheKey)
        }
    })()

    // Store in-flight request
    inFlightRequests.set(cacheKey, requestPromise)

    return requestPromise
}

async function fetchChannelWithRetry(slug: string, retries = MAX_RETRIES): Promise<{ response: Response | null; v2Data: ReturnType<typeof parseV2ChannelData> | null }> {
    // Try v2 API first (no auth required, more reliable)
    const v2Data = await fetchV2ChannelDataWithDedup(slug)

    // If v2 API succeeded, we can use it directly
    if (v2Data) {
        // Return a mock Response object for backward compatibility
        // Reconstruct minimal channel data structure from parsed v2 data
        const mockData = {
            slug: slug,
            broadcaster_user_id: v2Data.broadcaster_user_id,
            followers_count: v2Data.followers_count,
            livestream: v2Data.is_live ? {
                session_title: v2Data.stream_title,
                viewer_count: v2Data.viewer_count,
                started_at: v2Data.started_at,
                thumbnail: v2Data.thumbnail,
                category: v2Data.category,
                is_live: true,
            } : null,
        }
        const mockResponse = new Response(JSON.stringify(mockData), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        })
        return { response: mockResponse, v2Data }
    }

    // Fallback: Try official API without auth first
    const url = `${KICK_API_BASE}/channels?slug[]=${encodeURIComponent(slug)}`

    for (let attempt = 0; attempt < retries; attempt++) {
        const releaseSlot = await acquireRateLimitSlot()
        try {
            const controller = new AbortController()
            const timeoutId = setTimeout(() => controller.abort(), 8000)

            let response = await fetch(url, {
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                },
                signal: controller.signal,
                cache: 'no-store',
            })

            clearTimeout(timeoutId)

            // If 401, try with auth
            if (response.status === 401) {
                try {
                    let token = await getBroadcasterToken()
                    const clientId = process.env.KICK_CLIENT_ID

                    let authHeaders: Record<string, string> = {
                        'Authorization': `Bearer ${token}`,
                        'Accept': 'application/json',
                        'Content-Type': 'application/json',
                    }
                    if (clientId) {
                        authHeaders['Client-Id'] = clientId
                    }

                    let controller2 = new AbortController()
                    let timeoutId2 = setTimeout(() => controller2.abort(), 8000)

                    response = await fetch(url, {
                        headers: authHeaders,
                        signal: controller2.signal,
                        cache: 'no-store',
                    })

                    clearTimeout(timeoutId2)

                    // If still 401, try refreshing the token
                    if (response.status === 401) {
                        clearTokenCache()
                        const refreshedToken = await refreshBroadcasterToken()
                        if (refreshedToken) {
                            token = refreshedToken
                            authHeaders['Authorization'] = `Bearer ${token}`
                            controller2 = new AbortController()
                            timeoutId2 = setTimeout(() => controller2.abort(), 8000)
                            response = await fetch(url, {
                                headers: authHeaders,
                                signal: controller2.signal,
                                cache: 'no-store',
                            })
                            clearTimeout(timeoutId2)
                        } else {
                            clearTokenCache()
                            token = await getAppAccessToken()
                            authHeaders['Authorization'] = `Bearer ${token}`
                            controller2 = new AbortController()
                            timeoutId2 = setTimeout(() => controller2.abort(), 8000)
                            response = await fetch(url, {
                                headers: authHeaders,
                                signal: controller2.signal,
                                cache: 'no-store',
                            })
                            clearTimeout(timeoutId2)
                        }
                    }
                } catch (authError) {
                    return { response: null, v2Data: null }
                }
            }

            // If successful or client error (4xx), return immediately
            if (response.ok || (response.status >= 400 && response.status < 500)) {
                return { response, v2Data: null }
            }

            // For server errors (5xx), retry with exponential backoff
            if (response.status >= 500 && attempt < retries - 1) {
                const delay = INITIAL_RETRY_DELAY * Math.pow(2, attempt)
                await sleep(delay)
                continue
            }

            return { response, v2Data: null }
        } catch (error) {
            if (attempt === retries - 1) {
                return { response: null, v2Data: null }
            }
            const delay = INITIAL_RETRY_DELAY * Math.pow(2, attempt)
            await sleep(delay)
        } finally {
            releaseSlot()
        }
    }

    return { response: null, v2Data: null }
}

/**
 * Track stream session state (create, update, or close sessions)
 * Uses centralized session manager to prevent duplicate sessions.
 * This is the ONLY place where sessions should be created/ended.
 */
async function trackStreamSession(
    slug: string,
    broadcasterUserId: number | undefined,
    isLive: boolean,
    viewerCount: number,
    streamTitle: string,
    thumbnailUrl: string | null,
    kickStreamId?: string | null,
    apiStartedAt?: string | null
): Promise<void> {
    if (!broadcasterUserId) {
        return
    }

    try {
        const broadcasterIdBigInt = BigInt(broadcasterUserId)

        if (isLive) {
            // Stream is live - prefer authoritative started_at, but allow fallback to current time
            // This ensures sessions are created even when API data is incomplete
            if (apiStartedAt) {
                // We have authoritative started_at - safe to create/update session
                const session = await getOrCreateActiveSession(
                    broadcasterIdBigInt,
                    slug,
                    {
                        sessionTitle: streamTitle || null,
                        thumbnailUrl: thumbnailUrl,
                        kickStreamId: kickStreamId || null,
                        viewerCount: viewerCount,
                        startedAt: apiStartedAt,
                    },
                    apiStartedAt
                )

                if (session) {
                    // Mark that we've verified the stream is live (for grace period)
                    await touchSession(session.id)
                }
            } else {
                // No authoritative started_at - check for existing session first
                const existingSession = await getActiveSession(broadcasterIdBigInt)
                if (existingSession) {
                    // Update metadata and touch existing session
                    await updateSessionMetadata(existingSession.id, {
                        sessionTitle: streamTitle || null,
                        thumbnailUrl: thumbnailUrl,
                        kickStreamId: kickStreamId || null,
                        viewerCount: viewerCount,
                    })
                    await touchSession(existingSession.id)
                } else {
                    // No existing session and no started_at - create session with current time as fallback
                    // This ensures points can be awarded even when API doesn't provide started_at
                    const fallbackStartTime = new Date().toISOString()
                    const session = await getOrCreateActiveSession(
                        broadcasterIdBigInt,
                        slug,
                        {
                            sessionTitle: streamTitle || null,
                            thumbnailUrl: thumbnailUrl,
                            kickStreamId: kickStreamId || null,
                            viewerCount: viewerCount,
                            startedAt: fallbackStartTime,
                        },
                        fallbackStartTime
                    )

                    if (session) {
                        await touchSession(session.id)
                        console.log(`[Session] Created session with fallback start time (no API started_at available)`)
                    }
                }
            }
        } else {
            // Stream is offline - end the active session (with grace period)
            // The session manager will check grace period and skip test sessions
            await endActiveSession(broadcasterIdBigInt, false)
        }
    } catch (dbError) {
        console.error('❌ Error tracking stream session:', dbError)
        // Continue even if session tracking fails
    }
}

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url)
    const slug = searchParams.get('slug') || 'sweetflips'

    try {
        // Check cache first
        const cachedData = getCachedChannelData(slug)
        if (cachedData) {
            return NextResponse.json(cachedData, {
                headers: {
                    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
                    Pragma: 'no-cache',
                    Expires: '0',
                },
            })
        }

        const { response, v2Data: fetchedV2Data } = await fetchChannelWithRetry(slug)

        let channelData = null
        let broadcasterUserId: number | undefined = undefined
        let v2Data = fetchedV2Data

        if (response && response.ok) {
            const responseData = await response.json()

            // Parse response - official API returns { data: [channel] } format
            if (Array.isArray(responseData.data) && responseData.data.length > 0) {
                channelData = responseData.data[0]
            } else if (responseData.data && typeof responseData.data === 'object' && !Array.isArray(responseData.data)) {
                channelData = responseData.data
            } else if (responseData.id || responseData.broadcaster_user_id || responseData.slug) {
                // Direct channel object (legacy v2 format)
                channelData = responseData
            }
        }

        // If official API failed or returned no data, use v2 API only
        if (!channelData) {
            if (!v2Data) {
                return NextResponse.json(
                    { error: 'Channel not found' },
                    { status: 404 }
                )
            }

            // Build channelData from v2 API response with all required fields
            broadcasterUserId = v2Data.broadcaster_user_id
            channelData = {
                slug: slug,
                username: slug, // Fallback to slug if username not available
                broadcaster_user_id: v2Data.broadcaster_user_id,
                followers_count: v2Data.followers_count,
                chatroom_id: v2Data.chatroom_id, // Include chatroom_id from v2 data
                user: {
                    username: slug,
                    id: v2Data.broadcaster_user_id,
                },
                livestream: v2Data.is_live ? {
                    session_title: v2Data.stream_title,
                    viewer_count: v2Data.viewer_count,
                    started_at: v2Data.started_at,
                    thumbnail: v2Data.thumbnail,
                    category: v2Data.category,
                    is_live: true,
                } : null,
            }
        } else {
            broadcasterUserId = channelData.broadcaster_user_id || channelData.user?.id || channelData.user_id || channelData.id
            // Use v2Data broadcaster_user_id if official API didn't provide it
            if (!broadcasterUserId && v2Data?.broadcaster_user_id) {
                broadcasterUserId = v2Data.broadcaster_user_id
                // Ensure channelData has broadcaster_user_id
                if (!channelData.broadcaster_user_id) {
                    channelData.broadcaster_user_id = broadcasterUserId
                }
            }
            // Ensure slug and username are present
            if (!channelData.slug) {
                channelData.slug = slug
            }
            if (!channelData.username && !channelData.user?.username) {
                channelData.username = slug
                if (!channelData.user) {
                    channelData.user = { username: slug }
                } else if (!channelData.user.username) {
                    channelData.user.username = slug
                }
            }
        }

        // Extract stream data from livestream object
        const livestream = channelData.livestream

        // Extract thumbnail URL - handle both string and object formats
        let thumbnailUrl: string | null = null
        if (livestream?.thumbnail) {
            if (typeof livestream.thumbnail === 'string') {
                thumbnailUrl = livestream.thumbnail
            } else if (typeof livestream.thumbnail === 'object' && livestream.thumbnail.url) {
                thumbnailUrl = livestream.thumbnail.url
            }
        }

        // Get broadcaster_user_id if available
        if (!broadcasterUserId) {
            broadcasterUserId = channelData.broadcaster_user_id || channelData.user?.id || channelData.user_id || channelData.id
        }

        // Get live status.
        // For SweetFlips we intentionally bypass the official Kick API (/livestreams, /channels) because
        // the /livestreams filter is unreliable and creates noisy fallbacks. We rely on kick.com v2.
        const forceKickV2ForSlug = slug.toLowerCase() === 'sweetflips'

        let isLive = false
        let authoritativeStartedAt: string | null = null
        let authoritativeThumbnail: string | null = null

        if (forceKickV2ForSlug) {
            if (v2Data && v2Data.is_live !== undefined) {
                isLive = v2Data.is_live
                if (v2Data.started_at) authoritativeStartedAt = v2Data.started_at
                if (v2Data.thumbnail) authoritativeThumbnail = v2Data.thumbnail
            } else {
                isLive = false
            }
        } else if (broadcasterUserId) {
            // Use authoritative /livestreams endpoint
            const apiStatus = await checkLiveStatusFromAPI(slug, broadcasterUserId)
            isLive = apiStatus.isLive
            if (apiStatus.startedAt) authoritativeStartedAt = apiStatus.startedAt
            if (apiStatus.thumbnailUrl) authoritativeThumbnail = apiStatus.thumbnailUrl
        } else if (v2Data && v2Data.is_live !== undefined) {
            // Fallback to v2 API if we don't have broadcasterUserId yet
            isLive = v2Data.is_live
        }

        // v2 API is PRIMARY source for metadata (most complete and accurate)
        // But /livestreams is authoritative for isLive and started_at
        let viewerCount = 0
        let streamTitle = ''
        let streamStartedAt: string | null = null
        let category: { id: number; name: string } | null = null
        let followerCount = 0

        // Prefer authoritative started_at and thumbnail from /livestreams if available
        if (authoritativeStartedAt) {
            streamStartedAt = authoritativeStartedAt
        }
        if (authoritativeThumbnail) {
            thumbnailUrl = authoritativeThumbnail
        }

        // Use v2 data if available (more complete metadata)
        if (v2Data) {
            viewerCount = v2Data.viewer_count
            streamTitle = v2Data.stream_title
            category = v2Data.category
            followerCount = v2Data.followers_count
            // Only use v2 thumbnail/started_at if authoritative source didn't provide them
            if (!thumbnailUrl && v2Data.thumbnail) thumbnailUrl = v2Data.thumbnail
            if (!streamStartedAt && v2Data.started_at) streamStartedAt = v2Data.started_at
        } else if (channelData && !v2Data) {
            // If we didn't fetch v2 data separately, use what we have from channelData
            viewerCount = livestream?.viewer_count || 0
            streamTitle = livestream?.session_title || livestream?.stream_title || ''
            followerCount = channelData.followers_count || 0
            if (livestream?.started_at) streamStartedAt = livestream.started_at
        } else {
            // v2 API unavailable - use minimal fallback from channelData
            streamTitle = livestream?.session_title || livestream?.stream_title || ''
            if (livestream?.thumbnail) {
                if (typeof livestream.thumbnail === 'string') {
                    thumbnailUrl = livestream.thumbnail
                } else if (typeof livestream.thumbnail === 'object' && livestream.thumbnail.url) {
                    thumbnailUrl = livestream.thumbnail.url
                }
            }
        }

        // Log concise status summary (only when status changes or periodically)
        // Reduced verbosity - log only important status changes

        // Fetch active session early for fallback logic
        let activeSession: {
            id: bigint;
            started_at: Date;
            ended_at: Date | null;
            peak_viewer_count: number;
            session_title: string | null;
            thumbnail_url: string | null;
            kick_stream_id: string | null;
        } | null = null
        if (broadcasterUserId) {
            try {
                const broadcasterIdBigInt = BigInt(broadcasterUserId)
                activeSession = await db.streamSession.findFirst({
                    where: {
                        broadcaster_user_id: broadcasterIdBigInt,
                        ended_at: null,
                    },
                    orderBy: { started_at: 'desc' },
                    select: {
                        id: true,
                        started_at: true,
                        ended_at: true,
                        peak_viewer_count: true,
                        session_title: true,
                        thumbnail_url: true,
                        kick_stream_id: true,
                        last_live_check_at: true,
                    },
                })
            } catch (err) {
                console.error('❌ Error fetching active session:', err)
            }
        }

        // Check if there's a test session active (admin-created for testing)
        const isTestSession = activeSession?.session_title?.startsWith('[TEST]') || false

        // If test session is active, override live status to show as live on dashboard
        if (isTestSession && activeSession) {
            isLive = true
            streamTitle = activeSession.session_title || '[TEST] Test Session'
            streamStartedAt = activeSession.started_at.toISOString()
            // Set a test category
            if (!category) {
                category = { id: 0, name: 'Testing' }
            }
        }

        // FALLBACK: If we have an active session but API says offline, trust the session
        // This handles cases where Kick API is flaky but the stream is actually live
        if (!isLive && activeSession && !isTestSession) {
            const lastCheck = activeSession.last_live_check_at
            const sessionAge = lastCheck ? Date.now() - lastCheck.getTime() : Infinity

            // If session was touched within last 10 minutes, consider stream still live
            // This prevents premature offline status due to API flakiness
            const SESSION_TRUST_WINDOW_MS = 10 * 60 * 1000 // 10 minutes

            if (sessionAge < SESSION_TRUST_WINDOW_MS) {
                console.log(`[Channel API] Active session ${activeSession.id} exists (last check ${Math.round(sessionAge / 1000)}s ago), overriding offline status`)
                isLive = true
                streamTitle = activeSession.session_title || streamTitle
                streamStartedAt = activeSession.started_at.toISOString()
            }
        }

        // Fallback: If API didn't provide started_at but stream is live, use database session time
        if (isLive && !streamStartedAt && activeSession) {
            streamStartedAt = activeSession.started_at.toISOString()
        }

        // Extract chatroom_id if available - check multiple sources
        const chatroomId = channelData.chatroom?.id || channelData.chatroom_id || v2Data?.chatroom_id || null

        // Get last live time from database
        let lastLiveTime: Date | null = null

        try {
            // If v2 data didn't provide follower count, try from channelData
            if (followerCount === 0) {
                followerCount = channelData.followers_count ||
                    channelData.followers?.length ||
                    channelData.user?.followers_count ||
                    channelData.followersCount ||
                    0
            }

            // Final fallback: use cached follower count if API failed
            if (followerCount === 0) {
                const cached = followerCountCache.get(slug.toLowerCase())
                if (cached && (Date.now() - cached.updatedAt) < FOLLOWER_CACHE_TTL_MS) {
                    followerCount = cached.count
                    console.log(`[Channel API] Using cached follower count for ${slug}: ${followerCount}`)
                }
            }

            // Get last live time from database
            if (broadcasterUserId) {
                const lastSession = await db.streamSession.findFirst({
                    where: {
                        broadcaster_user_id: BigInt(broadcasterUserId),
                    },
                    orderBy: { started_at: 'desc' },
                    select: {
                        started_at: true,
                        ended_at: true,
                    },
                })

                if (lastSession) {
                    // Use ended_at if available, otherwise started_at if currently live
                    lastLiveTime = lastSession.ended_at || (isLive ? lastSession.started_at : null)
                }
            }
        } catch (dbError) {
            console.error('❌ Error fetching channel stats:', dbError)
            // Continue even if stats fail
        }

        // Track stream sessions (this is the ONLY place sessions are created/ended)
        await trackStreamSession(slug, broadcasterUserId, isLive, viewerCount, streamTitle, thumbnailUrl, null, streamStartedAt)

        // Ensure channelData exists before spreading
        if (!channelData) {
            return NextResponse.json(
                { error: 'Channel data not available' },
                { status: 500 }
            )
        }

        // Prepare final response
        const responseData = {
            ...channelData,
            broadcaster_user_id: broadcasterUserId,
            chatroom_id: chatroomId,
            is_live: isLive,
            is_test_session: isTestSession, // Flag to indicate test mode
            viewer_count: isTestSession ? 1 : viewerCount, // Show 1 viewer for test sessions
            session_title: streamTitle,
            stream_started_at: isLive ? streamStartedAt : null,
            stream: livestream || null,
            category: category,
            followers_count: followerCount,
            last_live_at: lastLiveTime?.toISOString() || null,
        }

        // Cache the response
        setCachedChannelData(slug, responseData)

        return NextResponse.json(responseData, {
            headers: {
                // Ensure no intermediate cache keeps a stale LIVE status
                'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
                Pragma: 'no-cache',
                Expires: '0',
            },
        })
    } catch (error) {
        const errorMessage = error instanceof Error
            ? (error.name === 'AbortError' ? 'Request timed out' : error.message)
            : 'Unknown error'

        console.error(`❌ Channel API error for ${slug}:`, errorMessage)

        return NextResponse.json(
            { error: 'Failed to fetch channel data', details: errorMessage },
            {
                status: 500,
                headers: {
                    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
                    Pragma: 'no-cache',
                    Expires: '0',
                },
            }
        )
    }
}
