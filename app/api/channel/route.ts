import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic'

// Simple in-memory cache with stale-while-revalidate
const cache = new Map<string, { data: any; timestamp: number }>()
const CACHE_TTL = 30000 // 30 seconds cache (increased from 5s to reduce API calls)
const STALE_TTL = 60000 // Return stale data for 60s while refreshing
const MAX_RETRIES = 3
const INITIAL_RETRY_DELAY = 1000 // 1 second
const lastStreamState = new Map<string, { isLive: boolean; sessionId?: bigint }>()

// Exponential backoff helper
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

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

    // Return fresh cache immediately
    if (cached && cacheAge < CACHE_TTL) {
        return NextResponse.json(cached.data)
    }

    // Stale-while-revalidate: return stale cache immediately, refresh in background
    const isStale = cached && cacheAge < STALE_TTL
    if (isStale) {
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

        // Extract stream data from livestream object
        const livestream = channelData.livestream
        const isLive = livestream?.is_live === true
        const viewerCount = isLive ? (livestream?.viewer_count ?? 0) : 0
        const streamTitle = livestream?.session_title || ''

        // Extract thumbnail URL - handle both string and object formats
        let thumbnailUrl: string | null = null
        if (livestream?.thumbnail) {
            if (typeof livestream.thumbnail === 'string') {
                thumbnailUrl = livestream.thumbnail
            } else if (typeof livestream.thumbnail === 'object' && livestream.thumbnail.url) {
                thumbnailUrl = livestream.thumbnail.url
            }
        }

        // Extract category from multiple possible locations:
        // 1. livestream.subcategory (most common for live streams)
        // 2. livestream.category
        // 3. livestream.categories[0] (if it's an array)
        // 4. channelData.category (fallback)
        // 5. channelData.subcategory (fallback)
        let category = null
        if (livestream) {
            category = livestream.subcategory ||
                      livestream.category ||
                      (Array.isArray(livestream.categories) && livestream.categories.length > 0 ? livestream.categories[0] : null)
        }
        if (!category) {
            category = channelData.category || channelData.subcategory || null
        }

        // Debug logging to help identify the actual structure (only when category is missing)
        if (isLive && !category) {
            console.warn(`⚠️ No category found for live stream ${slug}. Checking livestream.subcategory, livestream.category, or channelData.category`)
        }

        // Ensure broadcaster_user_id is available (try multiple possible locations)
        const broadcasterUserId = channelData.broadcaster_user_id || channelData.user?.id || channelData.user_id || channelData.id

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
