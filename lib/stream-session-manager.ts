/**
 * Stream Session Manager
 *
 * Centralized management for stream sessions. This is the SINGLE SOURCE OF TRUTH
 * for creating, updating, and ending stream sessions.
 *
 * Key principles:
 * 1. Only ONE active session per broadcaster (enforced by partial unique index)
 * 2. Sessions are created ONLY when stream goes live (via channel API polling)
 * 3. Other components (chat-worker, webhook) only READ session state
 * 4. Use atomic operations to prevent race conditions
 */

import { db } from '@/lib/db'
import { Prisma } from '@prisma/client'

// Grace period before ending a session (prevents flapping due to API inconsistencies)
const SESSION_END_GRACE_PERIOD_MS = 2 * 60 * 1000 // 2 minutes

// How close start times need to be to match sessions
const START_TIME_MATCH_WINDOW_MS = 5 * 60 * 1000 // 5 minutes

export interface SessionMetadata {
    sessionTitle?: string | null
    thumbnailUrl?: string | null
    kickStreamId?: string | null
    viewerCount?: number
    startedAt?: Date | string | null
}

export interface ActiveSession {
    id: bigint
    broadcaster_user_id: bigint
    channel_slug: string
    session_title: string | null
    thumbnail_url: string | null
    kick_stream_id: string | null
    started_at: Date
    ended_at: Date | null
    last_live_check_at: Date | null
    peak_viewer_count: number
    total_messages: number
}

/**
 * Get the active session for a broadcaster (if one exists)
 */
export async function getActiveSession(broadcasterUserId: bigint): Promise<ActiveSession | null> {
    try {
        const session = await db.streamSession.findFirst({
            where: {
                broadcaster_user_id: broadcasterUserId,
                ended_at: null,
            },
            orderBy: { started_at: 'desc' },
        })

        return session as ActiveSession | null
    } catch (error) {
        console.error('[SessionManager] Error getting active session:', error)
        return null
    }
}

/**
 * Get or create an active session for a broadcaster.
 * Uses atomic upsert-like logic with the partial unique constraint.
 *
 * @param broadcasterUserId - The broadcaster's kick_user_id
 * @param channelSlug - The channel slug (e.g., 'sweetflips')
 * @param metadata - Optional session metadata (title, thumbnail, etc.)
 * @param apiStartedAt - Optional start time from Kick API for matching
 */
export async function getOrCreateActiveSession(
    broadcasterUserId: bigint,
    channelSlug: string,
    metadata?: SessionMetadata,
    apiStartedAt?: Date | string | null
): Promise<ActiveSession | null> {
    const maxRetries = 3

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            // First, check for existing active session
            const existing = await db.streamSession.findFirst({
                where: {
                    broadcaster_user_id: broadcasterUserId,
                    ended_at: null,
                },
                orderBy: { started_at: 'desc' },
            })

            if (existing) {
                // Update existing session with new metadata
                const updateData: Prisma.StreamSessionUpdateInput = {
                    last_live_check_at: new Date(),
                    updated_at: new Date(),
                }

                if (metadata?.sessionTitle && !existing.session_title?.startsWith('[TEST]')) {
                    updateData.session_title = metadata.sessionTitle
                }
                if (metadata?.thumbnailUrl) {
                    updateData.thumbnail_url = metadata.thumbnailUrl
                }
                if (metadata?.kickStreamId) {
                    updateData.kick_stream_id = metadata.kickStreamId
                }
                if (metadata?.viewerCount !== undefined) {
                    updateData.peak_viewer_count = Math.max(existing.peak_viewer_count, metadata.viewerCount)
                }

                const updated = await db.streamSession.update({
                    where: { id: existing.id },
                    data: updateData,
                })

                return updated as ActiveSession
            }

            // No existing session - create a new one
            // Determine start time: prefer API start time if available and recent
            let startTime = new Date()
            if (apiStartedAt) {
                const apiStart = typeof apiStartedAt === 'string' ? new Date(apiStartedAt) : apiStartedAt
                // Only use API start time if it's within reasonable bounds (not too old)
                if (apiStart.getTime() > Date.now() - 24 * 60 * 60 * 1000) { // Within 24 hours
                    startTime = apiStart
                }
            }

            const newSession = await db.streamSession.create({
                data: {
                    broadcaster_user_id: broadcasterUserId,
                    channel_slug: channelSlug,
                    session_title: metadata?.sessionTitle || null,
                    thumbnail_url: metadata?.thumbnailUrl || null,
                    kick_stream_id: metadata?.kickStreamId || null,
                    started_at: startTime,
                    peak_viewer_count: metadata?.viewerCount || 0,
                    last_live_check_at: new Date(),
                },
            })

            console.log(`[SessionManager] Created new session ${newSession.id} for ${channelSlug}`)
            return newSession as ActiveSession

        } catch (error: any) {
            // Handle unique constraint violation (race condition - another request created session)
            if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
                console.log(`[SessionManager] Unique constraint hit, fetching existing session (attempt ${attempt + 1})`)

                // Another process created the session - fetch it
                const existing = await db.streamSession.findFirst({
                    where: {
                        broadcaster_user_id: broadcasterUserId,
                        ended_at: null,
                    },
                    orderBy: { started_at: 'desc' },
                })

                if (existing) {
                    return existing as ActiveSession
                }

                // Retry if we couldn't find it
                if (attempt < maxRetries - 1) {
                    await new Promise(resolve => setTimeout(resolve, 100 * Math.pow(2, attempt)))
                    continue
                }
            }

            // Handle connection errors with retry
            const isRetryable = error?.code === 'P2024' ||
                              error?.code === 'P2028' ||
                              error?.message?.includes('connection pool')

            if (isRetryable && attempt < maxRetries - 1) {
                await new Promise(resolve => setTimeout(resolve, 100 * Math.pow(2, attempt)))
                continue
            }

            console.error('[SessionManager] Error in getOrCreateActiveSession:', error)
            return null
        }
    }

    return null
}

/**
 * End an active session.
 *
 * @param sessionId - The session ID to end
 * @param force - If true, end immediately without grace period check
 */
export async function endSession(sessionId: bigint, force: boolean = false): Promise<boolean> {
    try {
        const session = await db.streamSession.findUnique({
            where: { id: sessionId },
            select: {
                id: true,
                ended_at: true,
                session_title: true,
                last_live_check_at: true,
                started_at: true,
            },
        })

        if (!session) {
            console.warn(`[SessionManager] Session ${sessionId} not found`)
            return false
        }

        if (session.ended_at) {
            console.log(`[SessionManager] Session ${sessionId} already ended`)
            return true
        }

        // Don't auto-end test sessions
        if (session.session_title?.startsWith('[TEST]') && !force) {
            console.log(`[SessionManager] Skipping auto-end of test session ${sessionId}`)
            return false
        }

        // Check grace period (unless forced)
        if (!force && session.last_live_check_at) {
            const timeSinceLastCheck = Date.now() - session.last_live_check_at.getTime()
            if (timeSinceLastCheck < SESSION_END_GRACE_PERIOD_MS) {
                console.log(`[SessionManager] Session ${sessionId} within grace period (${Math.round(timeSinceLastCheck / 1000)}s ago)`)
                return false
            }
        }

        // Count messages for this session
        const messageCount = await db.chatMessage.count({
            where: { stream_session_id: sessionId },
        })

        // Calculate duration
        const durationSeconds = Math.floor((Date.now() - session.started_at.getTime()) / 1000)

        await db.streamSession.update({
            where: { id: sessionId },
            data: {
                ended_at: new Date(),
                total_messages: messageCount,
                duration_seconds: durationSeconds,
                updated_at: new Date(),
            },
        })

        const hours = Math.floor(durationSeconds / 3600)
        const minutes = Math.floor((durationSeconds % 3600) / 60)
        console.log(`[SessionManager] Ended session ${sessionId} (duration: ${hours}h ${minutes}m, messages: ${messageCount})`)

        return true
    } catch (error) {
        console.error('[SessionManager] Error ending session:', error)
        return false
    }
}

/**
 * End the active session for a broadcaster (if one exists)
 */
export async function endActiveSession(broadcasterUserId: bigint, force: boolean = false): Promise<boolean> {
    const session = await getActiveSession(broadcasterUserId)
    if (!session) {
        return true // No session to end
    }
    return endSession(session.id, force)
}

/**
 * Update session metadata (thumbnail, title, etc.)
 */
export async function updateSessionMetadata(
    sessionId: bigint,
    metadata: SessionMetadata
): Promise<boolean> {
    try {
        const updateData: Prisma.StreamSessionUpdateInput = {
            updated_at: new Date(),
        }

        if (metadata.sessionTitle !== undefined) {
            updateData.session_title = metadata.sessionTitle
        }
        if (metadata.thumbnailUrl !== undefined) {
            updateData.thumbnail_url = metadata.thumbnailUrl
        }
        if (metadata.kickStreamId !== undefined) {
            updateData.kick_stream_id = metadata.kickStreamId
        }
        if (metadata.viewerCount !== undefined) {
            // Only update peak if new value is higher
            const current = await db.streamSession.findUnique({
                where: { id: sessionId },
                select: { peak_viewer_count: true },
            })
            if (current && metadata.viewerCount > current.peak_viewer_count) {
                updateData.peak_viewer_count = metadata.viewerCount
            }
        }

        await db.streamSession.update({
            where: { id: sessionId },
            data: updateData,
        })

        return true
    } catch (error) {
        console.error('[SessionManager] Error updating session metadata:', error)
        return false
    }
}

/**
 * Find a session by matching the Kick API's started_at time.
 * Used for correlating thumbnails with the correct session.
 */
export async function findSessionByStartTime(
    broadcasterUserId: bigint,
    apiStartedAt: Date | string
): Promise<ActiveSession | null> {
    try {
        const targetTime = typeof apiStartedAt === 'string' ? new Date(apiStartedAt) : apiStartedAt
        const windowStart = new Date(targetTime.getTime() - START_TIME_MATCH_WINDOW_MS)
        const windowEnd = new Date(targetTime.getTime() + START_TIME_MATCH_WINDOW_MS)

        const session = await db.streamSession.findFirst({
            where: {
                broadcaster_user_id: broadcasterUserId,
                started_at: {
                    gte: windowStart,
                    lte: windowEnd,
                },
            },
            orderBy: { started_at: 'desc' },
        })

        return session as ActiveSession | null
    } catch (error) {
        console.error('[SessionManager] Error finding session by start time:', error)
        return null
    }
}

/**
 * Mark that we've verified the session is still live.
 * Used to implement grace period before ending sessions.
 */
export async function touchSession(sessionId: bigint): Promise<void> {
    try {
        await db.streamSession.update({
            where: { id: sessionId },
            data: { last_live_check_at: new Date() },
        })
    } catch (error) {
        // Non-critical, log and continue
        console.warn('[SessionManager] Error touching session:', error)
    }
}
