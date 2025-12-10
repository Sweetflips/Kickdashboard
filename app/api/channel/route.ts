import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic'

// Kick Dev API base URL
const KICK_API_BASE = process.env.KICK_API_BASE || 'https://api.kick.com/public/v1'

const MAX_RETRIES = 3
const INITIAL_RETRY_DELAY = 1000 // 1 second

// Exponential backoff helper
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

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
 */
async function checkLiveStatusFromAPI(slug: string, broadcasterUserId?: number): Promise<{
    isLive: boolean
    viewerCount: number
    streamTitle: string
    thumbnailUrl: string | null
    startedAt: string | null
    category: { id: number; name: string } | null
}> {
    const offlineResult = { isLive: false, viewerCount: 0, streamTitle: '', thumbnailUrl: null, startedAt: null, category: null }

    try {
        // First, try the official /livestreams endpoint if we have broadcaster_user_id
        // This is the authoritative source for live status
        if (broadcasterUserId) {
            const livestreamsUrl = `${KICK_API_BASE}/livestreams?broadcaster_user_id[]=${broadcasterUserId}`
            console.log(`[Channel API] Checking official /livestreams endpoint for ${slug} (broadcaster_user_id: ${broadcasterUserId})`)

            const livestreamsResponse = await fetch(livestreamsUrl, {
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                },
                cache: 'no-store',
            })

            if (livestreamsResponse.ok) {
                const livestreamsData = await livestreamsResponse.json()
                console.log(`[Channel API] /livestreams response:`, JSON.stringify(livestreamsData, null, 2).substring(0, 1000))

                // If data array has items, stream is LIVE
                if (Array.isArray(livestreamsData.data) && livestreamsData.data.length > 0) {
                    const livestream = livestreamsData.data[0]
                    console.log(`[Channel API] Stream is LIVE (found in /livestreams endpoint)`)

                    let thumbnailUrl: string | null = null
                    if (livestream.thumbnail) {
                        if (typeof livestream.thumbnail === 'string') {
                            thumbnailUrl = livestream.thumbnail
                        } else if (typeof livestream.thumbnail === 'object' && livestream.thumbnail.url) {
                            thumbnailUrl = livestream.thumbnail.url
                        }
                    }

                    let viewerCount = 0
                    if (livestream.viewer_count !== undefined && livestream.viewer_count !== null) {
                        if (typeof livestream.viewer_count === 'string') {
                            const cleaned = livestream.viewer_count.replace(/[.,]/g, '')
                            viewerCount = parseInt(cleaned, 10) || 0
                        } else if (typeof livestream.viewer_count === 'number') {
                            viewerCount = Math.floor(livestream.viewer_count)
                        }
                    }

                    let category: { id: number; name: string } | null = null
                    if (livestream.category && typeof livestream.category === 'object') {
                        category = {
                            id: livestream.category.id,
                            name: livestream.category.name
                        }
                    }

                    let startedAt: string | null = livestream.started_at || null
                    if (startedAt) {
                        try {
                            const parsedDate = new Date(startedAt)
                            if (!isNaN(parsedDate.getTime())) {
                                startedAt = parsedDate.toISOString()
                            } else {
                                startedAt = null
                            }
                        } catch {
                            startedAt = null
                        }
                    }

                    return {
                        isLive: true,
                        viewerCount,
                        streamTitle: livestream.stream_title || livestream.session_title || '',
                        thumbnailUrl,
                        startedAt,
                        category,
                    }
                } else {
                    // Empty data array means stream is OFFLINE
                    console.log(`[Channel API] Stream is OFFLINE (empty /livestreams response)`)
                    return offlineResult
                }
            } else {
                console.warn(`[Channel API] /livestreams endpoint returned ${livestreamsResponse.status}`)
            }
        }

        // Fallback: Check v2 API if /livestreams didn't work
        // Look for livestream object existence + has actual stream data (started_at, viewer_count)
        const url = `https://kick.com/api/v2/channels/${slug.toLowerCase()}`
        console.log(`[Channel API] Fallback: Checking v2 API for live status: ${slug}`)

        const response = await fetch(url, {
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            },
            cache: 'no-store',
        })

        if (!response.ok) {
            console.warn(`[Channel API] v2 API returned ${response.status}`)
            return offlineResult
        }

        const data = await response.json()

        console.log(`[Channel API] v2 API response for ${slug}:`, JSON.stringify(data, null, 2).substring(0, 1500))

        const livestream = data.livestream

        if (!livestream) {
            console.log(`[Channel API] v2 API shows stream is OFFLINE for ${slug} (no livestream object)`)
            return offlineResult
        }

        console.log(`[Channel API] v2 livestream keys:`, Object.keys(livestream))
        console.log(`[Channel API] v2 livestream.is_live:`, livestream.is_live)
        console.log(`[Channel API] v2 livestream.started_at:`, livestream.started_at)
        console.log(`[Channel API] v2 livestream.viewer_count:`, livestream.viewer_count)

        // Determine if stream is live based on multiple indicators:
        // 1. Explicit is_live flag if present and truthy
        // 2. Or presence of started_at with no is_live:false
        // 3. Or viewer_count > 0
        const hasExplicitIsLive = livestream.is_live !== undefined && livestream.is_live !== null
        const explicitIsLive = hasExplicitIsLive ? normalizeIsLiveFlag(livestream.is_live) : null
        const hasStartedAt = !!livestream.started_at
        const hasViewers = (livestream.viewer_count !== undefined && livestream.viewer_count > 0)

        // If is_live is explicitly false, stream is offline
        if (explicitIsLive === false) {
            console.log(`[Channel API] v2 API shows stream is OFFLINE for ${slug} (is_live=false)`)
            return offlineResult
        }

        // Stream is live if: explicit is_live=true, OR (has started_at AND is_live not explicitly false)
        const isLive = explicitIsLive === true || (hasStartedAt && explicitIsLive !== false) || hasViewers

        if (!isLive) {
            console.log(`[Channel API] v2 API shows stream is OFFLINE for ${slug} (no live indicators)`)
            return offlineResult
        }

        console.log(`[Channel API] v2 API shows stream is LIVE for ${slug}`)

        let thumbnailUrl: string | null = null
        if (livestream.thumbnail) {
            if (typeof livestream.thumbnail === 'string') {
                thumbnailUrl = livestream.thumbnail
            } else if (typeof livestream.thumbnail === 'object' && livestream.thumbnail.url) {
                thumbnailUrl = livestream.thumbnail.url
            }
        }

        let viewerCount = 0
        if (livestream.viewer_count !== undefined && livestream.viewer_count !== null) {
            if (typeof livestream.viewer_count === 'string') {
                const cleaned = livestream.viewer_count.replace(/[.,]/g, '')
                viewerCount = parseInt(cleaned, 10) || 0
            } else if (typeof livestream.viewer_count === 'number') {
                viewerCount = Math.floor(livestream.viewer_count)
            }
        }

        let category: { id: number; name: string } | null = null
        if (livestream.category && typeof livestream.category === 'object') {
            category = {
                id: livestream.category.id,
                name: livestream.category.name
            }
        }

        let startedAt: string | null = livestream.started_at || null
        if (startedAt) {
            try {
                const parsedDate = new Date(startedAt)
                if (!isNaN(parsedDate.getTime())) {
                    startedAt = parsedDate.toISOString()
                } else {
                    startedAt = null
                }
            } catch {
                startedAt = null
            }
        }

        console.log(`[Channel API] Extracted data:`, {
            viewerCount,
            streamTitle: livestream.stream_title || livestream.session_title || '',
            startedAt,
            category: category,
        })

        return {
            isLive: true,
            viewerCount,
            streamTitle: livestream.stream_title || livestream.session_title || '',
            thumbnailUrl,
            startedAt,
            category,
        }
    } catch (error) {
        console.warn(`[Channel API] Failed to check API:`, error instanceof Error ? error.message : 'Unknown error')
        return offlineResult
    }
}

async function fetchChannelWithRetry(slug: string, retries = MAX_RETRIES): Promise<Response> {
    const url = `https://kick.com/api/v2/channels/${slug}`

    for (let attempt = 0; attempt < retries; attempt++) {
        try {
            const controller = new AbortController()
            const timeoutId = setTimeout(() => controller.abort(), 8000) // 8 second timeout

            const response = await fetch(url, {
                headers: {
                    'Accept': 'application/json',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                },
                signal: controller.signal,
                cache: 'no-store',
            })

            clearTimeout(timeoutId)

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
                throw error
            }
            const delay = INITIAL_RETRY_DELAY * Math.pow(2, attempt)
            await sleep(delay)
        }
    }

    throw new Error('Max retries exceeded')
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

        if (!response.ok) {
            const errorText = await response.text().catch(() => 'Unknown error')
            console.error(`❌ Kick API error: ${response.status} - ${errorText.substring(0, 200)}`)
            throw new Error(`Kick API error: ${response.status} - ${errorText.substring(0, 200)}`)
        }

        const channelData = await response.json()

        if (!channelData) {
            return NextResponse.json(
                { error: 'Channel not found' },
                { status: 404 }
            )
        }

        // Log channel data structure for debugging
        console.log(`[Channel API] Channel data keys:`, Object.keys(channelData))
        console.log(`[Channel API] Has categories:`, !!channelData.categories)
        console.log(`[Channel API] Has category:`, !!channelData.category)
        if (channelData.livestream) {
            console.log(`[Channel API] Livestream keys:`, Object.keys(channelData.livestream))
            console.log(`[Channel API] Livestream started_at:`, channelData.livestream.started_at)
            console.log(`[Channel API] Livestream category:`, channelData.livestream.category)
            console.log(`[Channel API] Livestream categories:`, channelData.livestream.categories)
        }

        // Extract stream data from livestream object (v2 API)
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

        // Get broadcaster_user_id first (needed for /livestreams endpoint)
        const broadcasterUserId = channelData.broadcaster_user_id || channelData.user?.id || channelData.user_id || channelData.id

        // Get live status from official /livestreams endpoint (authoritative source)
        let isLive = false
        let viewerCount = 0
        let streamTitle = livestream?.session_title || ''
        let streamStartedAt: string | null = null
        let category: { id: number; name: string } | null = null

        const apiStatus = await checkLiveStatusFromAPI(slug, broadcasterUserId)
        isLive = apiStatus.isLive
        viewerCount = apiStatus.viewerCount
        streamTitle = apiStatus.streamTitle || streamTitle
        if (apiStatus.thumbnailUrl) {
            thumbnailUrl = apiStatus.thumbnailUrl
        }
        streamStartedAt = apiStatus.startedAt
        category = apiStatus.category

        // Also check for categories array (some APIs return categories as array)
        if (!category && channelData.categories && Array.isArray(channelData.categories) && channelData.categories.length > 0) {
            const firstCategory = channelData.categories[0]
            category = {
                id: firstCategory.id || firstCategory.category_id,
                name: firstCategory.name
            }
            console.log(`[Channel API] Found category from categories array:`, category)
        }

        // Also check livestream.categories if not found yet
        if (!category && livestream?.categories && Array.isArray(livestream.categories) && livestream.categories.length > 0) {
            const firstCategory = livestream.categories[0]
            category = {
                id: firstCategory.id || firstCategory.category_id,
                name: firstCategory.name
            }
            console.log(`[Channel API] Found category from livestream.categories array:`, category)
        }

        console.log(`[Channel API] Final status for ${slug}: isLive=${isLive}, viewerCount=${viewerCount}, category=${category?.name || 'null'}, startedAt=${streamStartedAt}`)

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

        // Get follower count and last live time
        let followerCount = 0
        let lastLiveTime: Date | null = null

        try {
            // Extract follower count from various possible locations
            followerCount = channelData.followers_count ||
                channelData.followers?.length ||
                channelData.user?.followers_count ||
                channelData.followersCount ||
                0

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

        // Prepare response data
        const responseData = {
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
        }

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
