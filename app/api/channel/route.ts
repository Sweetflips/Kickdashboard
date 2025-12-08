import { db } from '@/lib/db';
import { NextResponse } from 'next/server';
import { getBroadcasterToken } from '@/lib/kick-api';

export const dynamic = 'force-dynamic'

// Kick Dev API base URL
const KICK_API_BASE = process.env.KICK_API_BASE || 'https://api.kick.com/public/v1'

// Simple in-memory cache with stale-while-revalidate
const cache = new Map<string, { data: any; timestamp: number }>()
const CACHE_TTL = 30000 // 30 seconds cache (increased from 5s to reduce API calls)
const STALE_TTL = 60000 // Return stale data for 60s while refreshing
const MAX_RETRIES = 3
const INITIAL_RETRY_DELAY = 1000 // 1 second
const lastStreamState = new Map<string, { isLive: boolean; sessionId?: bigint }>()
const lastMismatchLog = new Map<string, number>()
const MISMATCH_LOG_COOLDOWN = 60000 // Only log once per minute per channel

// Exponential backoff helper
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

/**
 * Check live status using official Kick Dev API /livestreams endpoint
 * This is the source of truth - if it returns data, stream is live
 */
async function checkLiveStatusFromOfficialAPI(broadcasterUserId: number): Promise<{
    isLive: boolean
    viewerCount: number
    streamTitle: string
    thumbnailUrl: string | null
    startedAt: string | null
    category: { id: number; name: string } | null
} | null> {
    try {
        const endpoint = `/livestreams?broadcaster_user_id[]=${broadcasterUserId}`
        const url = `${KICK_API_BASE}${endpoint}`

        let response = await fetch(url, {
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
            },
        })

        // Retry with auth if we get 401
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

        if (!response.ok) {
            console.warn(`[Channel API] Official livestreams endpoint returned ${response.status}`)
            return null
        }

        const data = await response.json()

        // If data array has items, stream is live
        if (Array.isArray(data.data) && data.data.length > 0) {
            const livestream = data.data[0]
            let thumbnailUrl: string | null = null
            
            if (livestream.thumbnail) {
                if (typeof livestream.thumbnail === 'string') {
                    thumbnailUrl = livestream.thumbnail
                } else if (typeof livestream.thumbnail === 'object' && livestream.thumbnail.url) {
                    thumbnailUrl = livestream.thumbnail.url
                }
            }

            // Ensure viewer_count is a number - parse if string, handle null/undefined
            let viewerCount = 0
            if (livestream.viewer_count !== undefined && livestream.viewer_count !== null) {
                if (typeof livestream.viewer_count === 'string') {
                    // Remove any formatting (commas, periods used as separators)
                    const cleaned = livestream.viewer_count.replace(/[.,]/g, '')
                    viewerCount = parseInt(cleaned, 10) || 0
                } else if (typeof livestream.viewer_count === 'number') {
                    viewerCount = Math.floor(livestream.viewer_count)
                }
            }

            // Extract category from official API response
            let category: { id: number; name: string } | null = null
            if (livestream.category && typeof livestream.category === 'object') {
                category = {
                    id: livestream.category.id,
                    name: livestream.category.name
                }
            }

            return {
                isLive: true,
                viewerCount,
                streamTitle: livestream.stream_title || livestream.session_title || '',
                thumbnailUrl,
                startedAt: livestream.started_at || null,
                category,
            }
        }

        // Empty array = stream is offline
        return { isLive: false, viewerCount: 0, streamTitle: '', thumbnailUrl: null, startedAt: null, category: null }
    } catch (error) {
        console.warn(`[Channel API] Failed to check official livestreams API:`, error instanceof Error ? error.message : 'Unknown error')
        return null
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

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url)
    const slug = searchParams.get('slug') || 'sweetflips'
    const cacheKey = `channel-${slug}`

    // Check cache first
    const cached = cache.get(cacheKey)
    const now = Date.now()
    const cacheAge = cached ? now - cached.timestamp : Infinity

    // Always verify live status AND viewer count from official API, even with cached data
    // This ensures stream status and viewer count are always accurate and up-to-date
    if (cached && cacheAge < CACHE_TTL) {
        const cachedBroadcasterId = cached.data?.broadcaster_user_id
        if (cachedBroadcasterId) {
            const officialStatus = await checkLiveStatusFromOfficialAPI(cachedBroadcasterId)
            if (officialStatus !== null) {
                const cachedIsLive = cached.data?.is_live || false
                const cachedViewerCount = cached.data?.viewer_count || 0
                
                // Always update viewer count and live status from official API
                // This ensures viewer count stays fresh even when live status doesn't change
                if (officialStatus.isLive !== cachedIsLive || officialStatus.viewerCount !== cachedViewerCount) {
                    const updatedData = {
                        ...cached.data,
                        is_live: officialStatus.isLive,
                        viewer_count: officialStatus.viewerCount,
                        session_title: officialStatus.streamTitle || cached.data?.session_title || '',
                        stream_started_at: officialStatus.isLive ? (officialStatus.startedAt || cached.data?.stream_started_at || null) : null,
                        category: officialStatus.category || cached.data?.category || null,
                    }
                    // Update cache with fresh data
                    cache.set(cacheKey, { data: updatedData, timestamp: cached.timestamp })
                    return NextResponse.json(updatedData)
                }
            }
        }
        // Data hasn't changed, return cached data
        return NextResponse.json(cached.data)
    }

    // Stale-while-revalidate: return stale cache immediately, refresh in background
    const isStale = cached && cacheAge < STALE_TTL
    if (isStale) {
        // Even for stale cache, verify live status and viewer count
        const cachedBroadcasterId = cached.data?.broadcaster_user_id
        if (cachedBroadcasterId) {
            const officialStatus = await checkLiveStatusFromOfficialAPI(cachedBroadcasterId)
            if (officialStatus !== null) {
                const cachedIsLive = cached.data?.is_live || false
                const cachedViewerCount = cached.data?.viewer_count || 0
                
                // Always update viewer count and live status from official API
                if (officialStatus.isLive !== cachedIsLive || officialStatus.viewerCount !== cachedViewerCount) {
                    const updatedData = {
                        ...cached.data,
                        is_live: officialStatus.isLive,
                        viewer_count: officialStatus.viewerCount,
                        session_title: officialStatus.streamTitle || cached.data?.session_title || '',
                        stream_started_at: officialStatus.isLive ? (officialStatus.startedAt || cached.data?.stream_started_at || null) : null,
                        category: officialStatus.category || cached.data?.category || null,
                    }
                    cache.set(cacheKey, { data: updatedData, timestamp: cached.timestamp })
                    return NextResponse.json(updatedData)
                }
            }
        }
        // Trigger background refresh (don't await)
        fetchChannelWithRetry(slug).catch(() => {
            // Silently fail background refresh
        })
        return NextResponse.json(cached.data)
    }

    try {
        const response = await fetchChannelWithRetry(slug)

        if (!response.ok) {
            const errorText = await response.text().catch(() => 'Unknown error')
            console.error(`❌ Kick API error: ${response.status} - ${errorText.substring(0, 200)}`)

            // Return cached data if available even if expired
            if (cached) {
                return NextResponse.json(cached.data)
            }

            throw new Error(`Kick API error: ${response.status} - ${errorText.substring(0, 200)}`)
        }

        const channelData = await response.json()

        if (!channelData) {
            return NextResponse.json(
                { error: 'Channel not found' },
                { status: 404 }
            )
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

        // Ensure broadcaster_user_id is available (try multiple possible locations)
        const broadcasterUserId = channelData.broadcaster_user_id || channelData.user?.id || channelData.user_id || channelData.id

        // Use official Kick Dev API /livestreams endpoint as source of truth for live status
        // This is more reliable than the v2 API's is_live field
        let isLive = false
        let viewerCount = 0
        let streamTitle = livestream?.session_title || ''
        let streamStartedAt: string | null = null
        let officialStatus: { isLive: boolean; viewerCount: number; streamTitle: string; thumbnailUrl: string | null; startedAt: string | null; category: { id: number; name: string } | null } | null = null

        if (broadcasterUserId) {
            officialStatus = await checkLiveStatusFromOfficialAPI(broadcasterUserId)
            
            if (officialStatus !== null) {
                // Official API responded - use it as source of truth
                isLive = officialStatus.isLive
                viewerCount = officialStatus.viewerCount
                if (officialStatus.streamTitle) {
                    streamTitle = officialStatus.streamTitle
                }
                if (officialStatus.thumbnailUrl) {
                    thumbnailUrl = officialStatus.thumbnailUrl
                }
                if (officialStatus.startedAt) {
                    streamStartedAt = officialStatus.startedAt
                }
                
                // Log mismatch between v2 API and official API (with cooldown to avoid spam)
                const v2IsLive = livestream?.is_live === true
                if (v2IsLive !== isLive) {
                    const now = Date.now()
                    const lastLog = lastMismatchLog.get(slug) || 0
                    if (now - lastLog > MISMATCH_LOG_COOLDOWN) {
                        console.log(`[Channel API] Live status mismatch for ${slug}: v2=${v2IsLive}, official=${isLive} (using official)`)
                        lastMismatchLog.set(slug, now)
                    }
                }
            } else {
                // Official API failed - fall back to v2 API
                isLive = livestream?.is_live === true
                if (isLive && livestream?.viewer_count !== undefined && livestream?.viewer_count !== null) {
                    if (typeof livestream.viewer_count === 'string') {
                        const cleaned = livestream.viewer_count.replace(/[.,]/g, '')
                        viewerCount = parseInt(cleaned, 10) || 0
                    } else {
                        viewerCount = Math.floor(livestream.viewer_count)
                    }
                } else {
                    viewerCount = 0
                }
                // Extract started_at from v2 API fallback
                if (isLive) {
                    streamStartedAt = livestream?.created_at || livestream?.started_at || null
                }
                console.log(`[Channel API] Official API unavailable, using v2 API fallback: isLive=${isLive}`)
            }
        } else {
            // No broadcaster_user_id - fall back to v2 API
            isLive = livestream?.is_live === true
            if (isLive && livestream?.viewer_count !== undefined && livestream?.viewer_count !== null) {
                if (typeof livestream.viewer_count === 'string') {
                    const cleaned = livestream.viewer_count.replace(/[.,]/g, '')
                    viewerCount = parseInt(cleaned, 10) || 0
                } else {
                    viewerCount = Math.floor(livestream.viewer_count)
                }
            } else {
                viewerCount = 0
            }
            // Extract started_at from v2 API fallback
            if (isLive) {
                streamStartedAt = livestream?.created_at || livestream?.started_at || null
            }
        }

        // Extract category from multiple possible locations:
        // 1. Official API category (most reliable for live streams)
        // 2. livestream.subcategory (v2 API)
        // 3. livestream.category (v2 API)
        // 4. livestream.categories[0] (v2 API, if it's an array)
        // 5. channelData.category (fallback)
        // 6. channelData.subcategory (fallback)
        let category = null
        
        // First try official API category if available
        if (officialStatus?.category) {
            category = officialStatus.category
        }
        
        // Fall back to v2 API if official API doesn't have category
        if (!category && livestream) {
            category = livestream.subcategory ||
                      livestream.category ||
                      (Array.isArray(livestream.categories) && livestream.categories.length > 0 ? livestream.categories[0] : null)
        }
        
        // Final fallback to channel data
        if (!category) {
            category = channelData.category || channelData.subcategory || null
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

        // Track stream sessions - always check database for active sessions
        if (broadcasterUserId) {
            try {
                const broadcasterIdBigInt = BigInt(broadcasterUserId)

                // Check database for active session (not relying on in-memory cache)
                const activeSession = await db.streamSession.findFirst({
                    where: {
                        broadcaster_user_id: broadcasterIdBigInt,
                        ended_at: null,
                    },
                    orderBy: { started_at: 'desc' },
                })

                const lastState = lastStreamState.get(slug)
                const wasLive = lastState?.isLive || false

                if (isLive && !wasLive) {
                    // Stream just went live - create session if none exists
                    if (!activeSession) {
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
                        lastStreamState.set(slug, { isLive: true, sessionId: session.id })
                        console.log(`✅ Stream went live - created session ${session.id}`)
                    } else {
                        // Use existing active session
                        lastStreamState.set(slug, { isLive: true, sessionId: activeSession.id })
                        console.log(`✅ Stream went live - using existing session ${activeSession.id}`)
                    }
                } else if (isLive && wasLive) {
                    // Stream still live - update active session
                    if (activeSession) {
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
                        lastStreamState.set(slug, { isLive: true, sessionId: activeSession.id })
                    }
                } else if (!isLive) {
                    // Stream is offline - ALWAYS end any active sessions regardless of wasLive state
                    // This handles cases where server restarts or cache clears
                    if (activeSession) {
                        const messageCount = await db.chatMessage.count({
                            where: { stream_session_id: activeSession.id },
                        })
                        await db.streamSession.update({
                            where: { id: activeSession.id },
                            data: {
                                ended_at: new Date(),
                                total_messages: messageCount,
                                updated_at: new Date(),
                            },
                        })
                        console.log(`🛑 Stream is offline - ended session ${activeSession.id}`)
                    }
                    lastStreamState.delete(slug)
                }
            } catch (dbError) {
                console.error('❌ Error tracking stream session:', dbError)
                // Continue even if session tracking fails
            }
        }

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

        // Cache the response
        cache.set(cacheKey, { data: responseData, timestamp: Date.now() })

        return NextResponse.json(responseData)
    } catch (error) {
        const errorMessage = error instanceof Error
            ? (error.name === 'AbortError' ? 'Request timed out' : error.message)
            : 'Unknown error'

        // Log timeout errors less verbosely (they're expected during high traffic)
        if (error instanceof Error && error.name === 'AbortError') {
            // Only log if we don't have cached data to return
            if (!cached) {
                console.error(`❌ Channel API timeout for ${slug}`)
            }
        } else {
            console.error(`❌ Channel API error for ${slug}:`, errorMessage)
        }

        // Return cached data if available even if expired (stale-while-revalidate)
        if (cached) {
            return NextResponse.json(cached.data)
        }

        return NextResponse.json(
            { error: 'Failed to fetch channel data', details: errorMessage },
            { status: 500 }
        )
    }
}
