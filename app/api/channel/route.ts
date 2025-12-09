import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic'

// Kick Dev API base URL
const KICK_API_BASE = process.env.KICK_API_BASE || 'https://api.kick.com/public/v1'

const MAX_RETRIES = 3
const INITIAL_RETRY_DELAY = 1000 // 1 second
const lastStreamState = new Map<string, { isLive: boolean; sessionId?: bigint }>()

// Exponential backoff helper
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

/**
 * Check live status using Kick v2 API (most reliable for real-time status)
 * GET https://kick.com/api/v2/channels/{slug}
 * Returns livestream object if live, null if offline
 */
async function checkLiveStatusFromV2API(slug: string): Promise<{
    isLive: boolean
    viewerCount: number
    streamTitle: string
    thumbnailUrl: string | null
    startedAt: string | null
    category: { id: number; name: string } | null
}> {
    try {
        const url = `https://kick.com/api/v2/channels/${slug.toLowerCase()}`
        
        console.log(`[Channel API] Checking v2 API for live status: ${slug}`)

        const response = await fetch(url, {
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            },
        })

        if (!response.ok) {
            console.warn(`[Channel API] v2 API returned ${response.status}`)
            return { isLive: false, viewerCount: 0, streamTitle: '', thumbnailUrl: null, startedAt: null, category: null }
        }

        const data = await response.json()
        
        // Log the full response structure for debugging
        console.log(`[Channel API] v2 API response for ${slug}:`, JSON.stringify(data, null, 2).substring(0, 1500))
        console.log(`[Channel API] Has livestream object:`, !!data.livestream)
        if (data.livestream) {
            console.log(`[Channel API] livestream.is_live:`, data.livestream.is_live)
            console.log(`[Channel API] livestream keys:`, Object.keys(data.livestream))
        }

        // Check if livestream exists and is_live flag
        const livestream = data.livestream
        
        if (!livestream || !livestream.is_live) {
            console.log(`[Channel API] v2 API shows stream is OFFLINE for ${slug} (has livestream: ${!!livestream}, is_live: ${livestream?.is_live})`)
            return { isLive: false, viewerCount: 0, streamTitle: '', thumbnailUrl: null, startedAt: null, category: null }
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

        // Log extracted data for debugging
        // Validate and normalize started_at timestamp to ensure proper timezone handling
        let startedAt: string | null = livestream.started_at || null
        if (startedAt) {
            try {
                const parsedDate = new Date(startedAt)
                if (isNaN(parsedDate.getTime())) {
                    console.warn(`[Channel API] Invalid started_at timestamp: ${startedAt}`)
                    startedAt = null
                } else {
                    // Normalize to ISO 8601 UTC format
                    startedAt = parsedDate.toISOString()
                }
            } catch (error) {
                console.error(`[Channel API] Error parsing started_at:`, error)
                startedAt = null
            }
        }

        console.log(`[Channel API] Extracted data:`, {
            viewerCount,
            streamTitle: livestream.stream_title || livestream.session_title || '',
            startedAt: livestream.started_at,
            startedAtNormalized: startedAt,
            startedAtTimestamp: startedAt ? new Date(startedAt).getTime() : null,
            nowTimestamp: Date.now(),
            category: category,
            categoryRaw: livestream.category
        })

        return {
            isLive: true,
            viewerCount,
            streamTitle: livestream.stream_title || livestream.session_title || '',
            thumbnailUrl,
            startedAt: startedAt,
            category,
        }
    } catch (error) {
        console.warn(`[Channel API] Failed to check v2 API:`, error instanceof Error ? error.message : 'Unknown error')
        return { isLive: false, viewerCount: 0, streamTitle: '', thumbnailUrl: null, startedAt: null, category: null }
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

/**
 * Track stream session state (create, update, or close sessions)
 * This runs regardless of cache status to ensure sessions are properly tracked
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
        
        // Fetch active session
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
                console.log(`🛑 Stream is offline - ended session ${activeSession.id} (duration: ${durationHours}h ${durationMinutes}m, messages: ${messageCount})`)
            }
            lastStreamState.delete(slug)
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

        // Get live status from v2 API (most reliable)
        let isLive = false
        let viewerCount = 0
        let streamTitle = livestream?.session_title || ''
        let streamStartedAt: string | null = null
        let category: { id: number; name: string } | null = null

        const v2Status = await checkLiveStatusFromV2API(slug)
        isLive = v2Status.isLive
        viewerCount = v2Status.viewerCount
        streamTitle = v2Status.streamTitle || streamTitle
        if (v2Status.thumbnailUrl) {
            thumbnailUrl = v2Status.thumbnailUrl
        }
        streamStartedAt = v2Status.startedAt
        category = v2Status.category

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

        // Ensure broadcaster_user_id is available (try multiple possible locations)
        const broadcasterUserId = channelData.broadcaster_user_id || channelData.user?.id || channelData.user_id || channelData.id

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

        return NextResponse.json(responseData)
    } catch (error) {
        const errorMessage = error instanceof Error
            ? (error.name === 'AbortError' ? 'Request timed out' : error.message)
            : 'Unknown error'

        console.error(`❌ Channel API error for ${slug}:`, errorMessage)

        return NextResponse.json(
            { error: 'Failed to fetch channel data', details: errorMessage },
            { status: 500 }
        )
    }
}
