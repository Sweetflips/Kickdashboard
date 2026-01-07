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

const CACHE_TTL_MS = 3000 // 3 seconds - fast polling for live status

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
        const prisma = db as any
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
 * Check live status using official Kick API /channels endpoint
 * Directly queries the channel by slug - no need to fetch all livestreams
 *
 * Returns isLive status, started_at, and thumbnail
 */
async function checkLiveStatusFromAPI(slug: string, broadcasterUserId?: number): Promise<{
    isLive: boolean
    startedAt?: string | null
    thumbnailUrl?: string | null
    viewerCount?: number
    sessionTitle?: string | null
    category?: { id: number; name: string; slug: string } | null
}> {
    try {
        // Use /channels endpoint directly - no need to fetch 100 random livestreams
        const channelsUrl = `${KICK_API_BASE}/channels?slug[]=${encodeURIComponent(slug)}`

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
                return { isLive: false }
            }

            // Check stream.is_live from /channels endpoint
            const stream = channel.stream
            const isLive = stream && normalizeIsLiveFlag(stream.is_live)
            
            console.log(`[Channel API] Official API for ${slug}: is_live=${isLive}, viewers=${stream?.viewer_count}`)

            if (!isLive) {
                return { isLive: false }
            }

            // Extract data from channel/livestream
            const livestream = channel.livestream
            const startedAt = livestream?.started_at || stream?.started_at || null
            let thumbnailUrl: string | null = null
            if (livestream?.thumbnail) {
                thumbnailUrl = typeof livestream.thumbnail === 'string'
                    ? livestream.thumbnail
                    : livestream.thumbnail.url || null
            }
            
            const viewerCount = stream?.viewer_count || livestream?.viewer_count || 0
            const sessionTitle = livestream?.session_title || stream?.session_title || null
            
            let category: { id: number; name: string; slug: string } | null = null
            const cat = livestream?.category || stream?.category
            if (cat) {
                category = {
                    id: cat.id || 0,
                    name: cat.name || cat.title || '',
                    slug: cat.slug || '',
                }
            }

            return { isLive: true, startedAt, thumbnailUrl, viewerCount, sessionTitle, category }
        } finally {
            releaseSlot()
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
            const prisma = db as any
            const url = `https://kick.com/api/v2/channels/${slug.toLowerCase()}`
            const releaseSlot = await acquireRateLimitSlot()
            try {
                const prisma = db as any
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
                    // v2 API often returns 403 (blocked by Cloudflare) - this is expected, fall back to official API
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
            // v2 API failures are expected - silently fall back to official API
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
            const prisma = db as any
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
                    const prisma = db as any
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
        const prisma = db as any
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
            // Stream is offline - end the active session immediately
            // Kick v2 API is reliable, so force-end when it reports offline
            await endActiveSession(broadcasterIdBigInt, true)
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
        const prisma = db as any
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
        // Strategy: Use official API as primary (authenticated, reliable), v2 API for supplementary metadata
        // v2 API (kick.com/api/v2) is blocked by Cloudflare on some server IPs, so we can't rely on it alone

        let isLive = false
        let authoritativeStartedAt: string | null = null
        let authoritativeThumbnail: string | null = null
        let authoritativeViewerCount: number | undefined = undefined
        let authoritativeTitle: string | null = null
        let authoritativeCategory: { id: number; name: string; slug: string } | null = null
        
        // Track if we got a definitive API response (vs API failure)
        let apiResponseReceived = false

        // Primary: Use official authenticated /livestreams API (most reliable)
        if (broadcasterUserId) {
            const apiStatus = await checkLiveStatusFromAPI(slug, broadcasterUserId)
            isLive = apiStatus.isLive
            apiResponseReceived = true
            if (apiStatus.startedAt) authoritativeStartedAt = apiStatus.startedAt
            if (apiStatus.thumbnailUrl) authoritativeThumbnail = apiStatus.thumbnailUrl
            if (apiStatus.viewerCount !== undefined) authoritativeViewerCount = apiStatus.viewerCount
            if (apiStatus.sessionTitle) authoritativeTitle = apiStatus.sessionTitle
            if (apiStatus.category) authoritativeCategory = apiStatus.category
            console.log(`[Channel API] Official API for ${slug}: is_live=${isLive}, viewers=${authoritativeViewerCount}`)
        } else if (v2Data && v2Data.is_live !== undefined) {
            // Fallback to v2 API only if we don't have broadcasterUserId
            isLive = v2Data.is_live
            apiResponseReceived = true
            if (v2Data.started_at) authoritativeStartedAt = v2Data.started_at
            if (v2Data.thumbnail) authoritativeThumbnail = v2Data.thumbnail
            console.log(`[Channel API] v2 API fallback for ${slug}: is_live=${isLive}`)
        } else {
            // No API data available - will check for active session below
            console.log(`[Channel API] No API data for ${slug} - will check for active session`)
            apiResponseReceived = false
        }

        // Metadata priority:
        // 1. v2 API (most complete - has viewer count, category, title)
        // 2. Official /livestreams API (reliable but less metadata)
        // 3. channelData from /channels endpoint
        let viewerCount = 0
        let streamTitle = ''
        let streamStartedAt: string | null = null
        let category: { id: number; name: string } | null = null
        let followerCount = 0

        // Start with authoritative data from /livestreams
        if (authoritativeStartedAt) {
            streamStartedAt = authoritativeStartedAt
        }
        if (authoritativeThumbnail) {
            thumbnailUrl = authoritativeThumbnail
        }
        if (authoritativeViewerCount !== undefined) {
            viewerCount = authoritativeViewerCount
        }
        if (authoritativeTitle) {
            streamTitle = authoritativeTitle
        }
        if (authoritativeCategory) {
            category = { id: authoritativeCategory.id, name: authoritativeCategory.name }
        }

        // Supplement with v2 data if available (may have more complete info)
        if (v2Data) {
            // Only override if we don't have data from official API or v2 has better data
            if (viewerCount === 0 && v2Data.viewer_count > 0) {
                viewerCount = v2Data.viewer_count
            }
            if (!streamTitle && v2Data.stream_title) {
                streamTitle = v2Data.stream_title
            }
            if (!category && v2Data.category) {
                category = v2Data.category
            }
            if (followerCount === 0 && v2Data.followers_count > 0) {
                followerCount = v2Data.followers_count
            }
            if (!thumbnailUrl && v2Data.thumbnail) {
                thumbnailUrl = v2Data.thumbnail
            }
            if (!streamStartedAt && v2Data.started_at) {
                streamStartedAt = v2Data.started_at
            }
        }
        
        // Final fallback to channelData/livestream
        if (channelData) {
            if (viewerCount === 0 && livestream?.viewer_count) {
                viewerCount = livestream.viewer_count
            }
            if (!streamTitle) {
                streamTitle = livestream?.session_title || livestream?.stream_title || ''
            }
            if (followerCount === 0 && channelData.followers_count) {
                followerCount = channelData.followers_count
            }
            if (!streamStartedAt && livestream?.started_at) {
                streamStartedAt = livestream.started_at
            }
            if (!thumbnailUrl && livestream?.thumbnail) {
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
            last_live_check_at: Date | null;
        } | null = null
        if (broadcasterUserId) {
            try {
                const prisma = db as any
                const broadcasterIdBigInt = BigInt(broadcasterUserId)
                activeSession = await prisma.streamSession.findFirst({
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

        // FALLBACK: If API failed to respond (not an explicit offline), check for active session
        // This prevents session termination due to transient API failures
        if (!apiResponseReceived && activeSession && !activeSession.ended_at) {
            // We have an active session but API didn't respond - trust the session
            // Only keep the session alive if it was recently verified (within 5 minutes)
            const lastCheckTime = activeSession.last_live_check_at?.getTime() || 0
            const timeSinceLastCheck = Date.now() - lastCheckTime
            const GRACE_PERIOD_MS = 5 * 60 * 1000 // 5 minutes
            
            if (timeSinceLastCheck < GRACE_PERIOD_MS) {
                console.log(`[Channel API] API failed but active session exists (last check ${Math.round(timeSinceLastCheck/1000)}s ago) - treating as LIVE`)
                isLive = true
                // Use session data for stream info
                if (activeSession.started_at) {
                    streamStartedAt = activeSession.started_at.toISOString()
                }
                if (activeSession.session_title) {
                    streamTitle = activeSession.session_title
                }
                if (activeSession.thumbnail_url) {
                    thumbnailUrl = activeSession.thumbnail_url
                }
            } else {
                console.log(`[Channel API] API failed and session is stale (${Math.round(timeSinceLastCheck/1000)}s since last check) - treating as OFFLINE`)
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
            const prisma = db as any
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
                const lastSession = await prisma.streamSession.findFirst({
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
        // Only update session state if we got a definitive API response
        // This prevents ending sessions due to transient API failures
        if (apiResponseReceived || isLive) {
            await trackStreamSession(slug, broadcasterUserId, isLive, viewerCount, streamTitle, thumbnailUrl, null, streamStartedAt)
        } else {
            console.log(`[Channel API] Skipping session tracking - API didn't respond and isLive=${isLive}`)
        }

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
