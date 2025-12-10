import { db } from '@/lib/db';
import { getBroadcasterToken } from '@/lib/kick-api';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic'

// Kick Dev API base URL
const KICK_API_BASE = process.env.KICK_API_BASE || 'https://api.kick.com/public/v1'

const MAX_RETRIES = 3
const INITIAL_RETRY_DELAY = 1000 // 1 second

// Exponential backoff helper
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

/**
 * Fetch channel metadata from v2 API (has more complete data like followers, title, viewers, category)
 * This is used to supplement the official API which may lack some fields
 */
async function fetchV2ChannelData(slug: string): Promise<{
    followers_count: number
    viewer_count: number
    stream_title: string
    category: { id: number; name: string } | null
    is_live: boolean
    started_at: string | null
    thumbnail: string | null
} | null> {
    try {
        const url = `https://kick.com/api/v2/channels/${slug.toLowerCase()}`
        console.log(`[Channel API] Fetching v2 API for metadata: ${url}`)

        const response = await fetch(url, {
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            },
            cache: 'no-store',
        })

        if (!response.ok) {
            console.warn(`[Channel API] v2 API returned ${response.status}`)
            return null
        }

        const data = await response.json()

        // Log ALL important data from v2 API
        console.log(`[Channel API] ========== V2 API FULL DATA ==========`)
        console.log(`[Channel API] slug: ${data.slug}`)
        console.log(`[Channel API] user.username: ${data.user?.username}`)
        console.log(`[Channel API] followers_count: ${data.followers_count}`)
        console.log(`[Channel API] subscriber_count: ${data.subscriber_count}`)
        console.log(`[Channel API] verified: ${data.verified}`)

        if (data.livestream) {
            console.log(`[Channel API] livestream.id: ${data.livestream.id}`)
            console.log(`[Channel API] livestream.session_title: ${data.livestream.session_title}`)
            console.log(`[Channel API] livestream.is_live: ${data.livestream.is_live}`)
            console.log(`[Channel API] livestream.viewer_count: ${data.livestream.viewer_count}`)
            console.log(`[Channel API] livestream.started_at: ${data.livestream.started_at}`)
            console.log(`[Channel API] livestream.thumbnail: ${JSON.stringify(data.livestream.thumbnail)}`)
            console.log(`[Channel API] livestream.category: ${JSON.stringify(data.livestream.category)}`)
            console.log(`[Channel API] livestream.categories: ${JSON.stringify(data.livestream.categories)}`)
        } else {
            console.log(`[Channel API] livestream: null (stream is offline)`)
        }
        console.log(`[Channel API] ========================================`)

        const livestream = data.livestream
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
            is_live: !!livestream?.is_live,
            started_at: livestream?.started_at || null,
            thumbnail,
        }
    } catch (error) {
        console.warn(`[Channel API] Failed to fetch v2 API:`, error instanceof Error ? error.message : 'Unknown error')
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
 * Returns only isLive status - metadata comes from v2 API which is more complete
 */
async function checkLiveStatusFromAPI(slug: string, broadcasterUserId?: number): Promise<{
    isLive: boolean
}> {

    try {
        // First, try the official /livestreams endpoint if we have broadcaster_user_id
        // This is the authoritative source for live status
        if (broadcasterUserId) {
            const livestreamsUrl = `${KICK_API_BASE}/livestreams?broadcaster_user_id[]=${broadcasterUserId}`
            console.log(`[Channel API] Checking official /livestreams endpoint for ${slug} (broadcaster_user_id: ${broadcasterUserId})`)

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
                console.log(`[Channel API] /livestreams returned 401, retrying with auth`)
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
                console.log(`[Channel API] /livestreams response:`, JSON.stringify(livestreamsData, null, 2).substring(0, 500))

                // If data array has items, stream is LIVE
                if (Array.isArray(livestreamsData.data) && livestreamsData.data.length > 0) {
                    console.log(`[Channel API] Stream is LIVE (found in /livestreams endpoint)`)
                    return { isLive: true }
                } else {
                    // Empty data array means stream is OFFLINE
                    console.log(`[Channel API] Stream is OFFLINE (empty /livestreams response)`)
                    return { isLive: false }
                }
            } else {
                console.warn(`[Channel API] /livestreams endpoint returned ${livestreamsResponse.status}`)
            }
        }

        // Fallback: Use official /channels endpoint with auth
        const channelsUrl = `${KICK_API_BASE}/channels?slug[]=${encodeURIComponent(slug)}`
        console.log(`[Channel API] Fallback: Checking official /channels endpoint for ${slug}`)

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

            // Check stream.is_live from /channels endpoint
            const stream = channel.stream
            if (!stream || !stream.is_live) {
                console.log(`[Channel API] /channels shows stream is OFFLINE for ${slug}`)
                return { isLive: false }
            }

            console.log(`[Channel API] /channels shows stream is LIVE for ${slug}`)
            return { isLive: true }
        } catch (fallbackError) {
            console.warn(`[Channel API] Fallback /channels failed:`, fallbackError instanceof Error ? fallbackError.message : 'Unknown error')
            return { isLive: false }
        }
    } catch (error) {
        console.warn(`[Channel API] Failed to check API:`, error instanceof Error ? error.message : 'Unknown error')
        return { isLive: false }
    }
}

async function fetchChannelWithRetry(slug: string, retries = MAX_RETRIES): Promise<Response | null> {
    // Try v2 API first (no auth required, more reliable)
    const v2Url = `https://kick.com/api/v2/channels/${slug.toLowerCase()}`
    
    try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 8000)
        
        const v2Response = await fetch(v2Url, {
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            },
            signal: controller.signal,
            cache: 'no-store',
        })
        
        clearTimeout(timeoutId)
        
        if (v2Response.ok) {
            // Return a mock Response object that works with our parsing logic
            return v2Response
        }
    } catch (error) {
        console.warn(`[Channel API] v2 API failed, trying official API:`, error instanceof Error ? error.message : 'Unknown error')
    }
    
    // Fallback: Try official API without auth first
    const url = `${KICK_API_BASE}/channels?slug[]=${encodeURIComponent(slug)}`
    
    for (let attempt = 0; attempt < retries; attempt++) {
        try {
            const controller = new AbortController()
            const timeoutId = setTimeout(() => controller.abort(), 8000)

            // Try without auth first
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

                    const controller2 = new AbortController()
                    const timeoutId2 = setTimeout(() => controller2.abort(), 8000)
                    
                    response = await fetch(url, {
                        headers: authHeaders,
                        signal: controller2.signal,
                        cache: 'no-store',
                    })
                    
                    clearTimeout(timeoutId2)
                } catch (authError) {
                    console.warn(`[Channel API] Auth failed, will use v2 API only:`, authError instanceof Error ? authError.message : 'Unknown error')
                    return null
                }
            }

            // If successful or client error (4xx), return immediately
            if (response.ok || (response.status >= 400 && response.status < 500)) {
                return response
            }

            // For server errors (5xx), retry with exponential backoff
            if (response.status >= 500 && attempt < retries - 1) {
                const delay = INITIAL_RETRY_DELAY * Math.pow(2, attempt)
                await sleep(delay)
                continue
            }

            return response
        } catch (error) {
            if (attempt === retries - 1) {
                console.warn(`[Channel API] All retries failed, will use v2 API only`)
                return null
            }
            const delay = INITIAL_RETRY_DELAY * Math.pow(2, attempt)
            await sleep(delay)
        }
    }

    return null
}

/**
 * Track stream session state (create, update, or close sessions)
 * Relies entirely on database state - no in-memory caching
 */
async function trackStreamSession(
    slug: string,
    broadcasterUserId: number | undefined,
    isLive: boolean,
    viewerCount: number,
    streamTitle: string,
    thumbnailUrl: string | null
): Promise<void> {
    if (!broadcasterUserId) {
        return
    }

    try {
        const broadcasterIdBigInt = BigInt(broadcasterUserId)

        // Fetch active session from database (no caching)
        const activeSession = await db.streamSession.findFirst({
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
            },
        })

        if (isLive) {
            if (!activeSession) {
                // Stream is live but no active session - create one
                const session = await db.streamSession.create({
                    data: {
                        broadcaster_user_id: broadcasterIdBigInt,
                        channel_slug: slug,
                        session_title: streamTitle || null,
                        thumbnail_url: thumbnailUrl,
                        started_at: new Date(),
                        peak_viewer_count: viewerCount,
                    },
                })
                console.log(`✅ Stream is LIVE - created session ${session.id}`)
            } else {
                // Stream is live and session exists - update it
                const newPeak = Math.max(activeSession.peak_viewer_count, viewerCount)
                await db.streamSession.update({
                    where: { id: activeSession.id },
                    data: {
                        session_title: streamTitle || activeSession.session_title,
                        thumbnail_url: thumbnailUrl || activeSession.thumbnail_url,
                        peak_viewer_count: newPeak,
                        updated_at: new Date(),
                    },
                })
                console.log(`✅ Stream is LIVE - updated session ${activeSession.id} (peak: ${newPeak})`)
            }
        } else {
            // Stream is offline - end any active sessions
            if (activeSession) {
                const messageCount = await db.chatMessage.count({
                    where: { stream_session_id: activeSession.id },
                })

                // Calculate duration in seconds
                const startTime = activeSession.started_at.getTime()
                const endTime = Date.now()
                const durationSeconds = Math.floor((endTime - startTime) / 1000)
                const durationHours = Math.floor(durationSeconds / 3600)
                const durationMinutes = Math.floor((durationSeconds % 3600) / 60)

                await db.streamSession.update({
                    where: { id: activeSession.id },
                    data: {
                        ended_at: new Date(),
                        total_messages: messageCount,
                        duration_seconds: durationSeconds,
                        updated_at: new Date(),
                    },
                })
                console.log(`🛑 Stream is OFFLINE - ended session ${activeSession.id} (duration: ${durationHours}h ${durationMinutes}m, messages: ${messageCount})`)
            }
        }
    } catch (dbError) {
        console.error('❌ Error tracking stream session:', dbError)
        // Continue even if session tracking fails
    }
}

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url)
    const slug = searchParams.get('slug') || 'sweetflips'

    console.log(`[Channel API] Fetching fresh data for ${slug}`)

    try {
        const response = await fetchChannelWithRetry(slug)

        let channelData = null
        let broadcasterUserId: number | undefined = undefined

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
            console.log(`[Channel API] Official API unavailable, using v2 API only`)
            const v2Data = await fetchV2ChannelData(slug)
            
            if (!v2Data) {
                return NextResponse.json(
                    { error: 'Channel not found' },
                    { status: 404 }
                )
            }

            // Build channelData from v2 API response
            broadcasterUserId = undefined // v2 API doesn't always provide this
            channelData = {
                slug: slug,
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
        } else {
            broadcasterUserId = channelData.broadcaster_user_id || channelData.user?.id || channelData.user_id || channelData.id
        }

        // Log channel data structure for debugging
        console.log(`[Channel API] Channel data keys:`, Object.keys(channelData))
        console.log(`[Channel API] Has stream:`, !!channelData.stream)
        console.log(`[Channel API] Has livestream:`, !!channelData.livestream)
        if (channelData.stream) {
            console.log(`[Channel API] stream.is_live:`, channelData.stream.is_live)
        }
        if (channelData.livestream) {
            console.log(`[Channel API] Livestream keys:`, Object.keys(channelData.livestream))
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

        // Fetch v2 API data for complete metadata (followers, title, viewers, category)
        // The official API often lacks these fields - v2 is PRIMARY source
        const v2Data = await fetchV2ChannelData(slug)

        // Get live status from official /livestreams endpoint (authoritative source)
        const apiStatus = await checkLiveStatusFromAPI(slug, broadcasterUserId)
        let isLive = apiStatus.isLive

        // v2 API is PRIMARY source for metadata (most complete and accurate)
        let viewerCount = 0
        let streamTitle = ''
        let streamStartedAt: string | null = null
        let category: { id: number; name: string } | null = null
        let followerCount = 0

        if (v2Data) {
            viewerCount = v2Data.viewer_count
            streamTitle = v2Data.stream_title
            category = v2Data.category
            followerCount = v2Data.followers_count
            if (v2Data.thumbnail) thumbnailUrl = v2Data.thumbnail
            if (v2Data.started_at) streamStartedAt = v2Data.started_at

            // Also trust v2 for live status if official API failed
            if (!isLive && v2Data.is_live) {
                console.log(`[Channel API] Official API says offline but v2 says live - using v2 status`)
                isLive = true
            }

            // Log v2 API response for debugging
            console.log(`[Channel API] v2 API: title="${v2Data.stream_title}", viewers=${v2Data.viewer_count}, followers=${v2Data.followers_count}, category=${v2Data.category?.name || 'null'}`)
        } else {
            // v2 API unavailable - use minimal fallback from channelData
            console.warn(`[Channel API] v2 API unavailable, using fallback data`)
            streamTitle = livestream?.session_title || livestream?.stream_title || ''
            if (livestream?.thumbnail) {
                if (typeof livestream.thumbnail === 'string') {
                    thumbnailUrl = livestream.thumbnail
                } else if (typeof livestream.thumbnail === 'object' && livestream.thumbnail.url) {
                    thumbnailUrl = livestream.thumbnail.url
                }
            }
        }

        console.log(`[Channel API] Final status for ${slug}: isLive=${isLive}, viewerCount=${viewerCount}, followers=${followerCount}, category=${category?.name || 'null'}, title="${streamTitle}", startedAt=${streamStartedAt}`)

        // Fetch active session early for fallback logic
        let activeSession: {
            id: bigint;
            started_at: Date;
            ended_at: Date | null;
            peak_viewer_count: number;
            session_title: string | null;
            thumbnail_url: string | null;
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
                    },
                })
            } catch (err) {
                console.error('❌ Error fetching active session:', err)
            }
        }

        // Fallback: If API didn't provide started_at but stream is live, use database session time
        if (isLive && !streamStartedAt && activeSession) {
            streamStartedAt = activeSession.started_at.toISOString()
            console.log(`[Channel API] Using database session start time as fallback: ${streamStartedAt}`)
        }

        // Extract chatroom_id if available
        const chatroomId = channelData.chatroom?.id || channelData.chatroom_id || null

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

        // Track stream sessions
        await trackStreamSession(slug, broadcasterUserId, isLive, viewerCount, streamTitle, thumbnailUrl)

        // Prepare final response
        return NextResponse.json({
            ...channelData,
            broadcaster_user_id: broadcasterUserId,
            chatroom_id: chatroomId,
            is_live: isLive,
            viewer_count: viewerCount,
            session_title: streamTitle,
            stream_started_at: isLive ? streamStartedAt : null,
            stream: livestream || null,
            category: category,
            followers_count: followerCount,
            last_live_at: lastLiveTime?.toISOString() || null,
        }, {
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
