import { enqueueChatJob, type ChatJobPayload } from '@/lib/chat-queue';
import type { ChatMessage } from '@/lib/chat-store';
import { db } from '@/lib/db';
import { logErrorRateLimited, logWarnRateLimited } from '@/lib/rate-limited-logger';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic'

/**
 * SIMPLIFIED CHAT SAVE ROUTE
 *
 * This route ONLY validates and enqueues messages.
 * All writes (users, messages, points) are handled by the worker.
 *
 * Flow:
 * 1. Receive message from Kick WebSocket
 * 2. Validate message structure
 * 3. Check for active stream session (read-only)
 * 4. Enqueue job for worker
 * 5. Return immediately
 */

// Helper function to extract emotes from message content [emote:ID:Name] format
function extractEmotesFromContent(content: string): Array<{ emote_id: string; positions: Array<{ s: number; e: number }> }> {
    const emotePattern = /\[emote:(\d+):([^\]]+)\]/g
    const emotesMap = new Map<string, Array<{ s: number; e: number }>>()

    let match
    while ((match = emotePattern.exec(content)) !== null) {
        const emoteId = match[1]
        const start = match.index
        const end = start + match[0].length - 1

        if (!emotesMap.has(emoteId)) {
            emotesMap.set(emoteId, [])
        }
        emotesMap.get(emoteId)!.push({ s: start, e: end })
    }

    return Array.from(emotesMap.entries()).map(([emote_id, positions]) => ({
        emote_id,
        positions,
    }))
}

export async function POST(request: Request) {
    const startTime = Date.now()
    try {
        const body = await request.json()
        const message = body as ChatMessage

        // ═══════════════════════════════════════════════════════════════
        // STEP 1: VALIDATE MESSAGE STRUCTURE
        // ═══════════════════════════════════════════════════════════════

        if (!message.message_id || typeof message.message_id !== 'string' || message.message_id.trim() === '') {
            return NextResponse.json(
                { error: 'Invalid message structure: message_id is required' },
                { status: 400 }
            )
        }

        if (!message.sender || !message.content || !message.broadcaster) {
            return NextResponse.json(
                { error: 'Invalid message structure: sender, content, and broadcaster are required' },
                { status: 400 }
            )
        }

        if (message.sender.user_id <= 0) {
            return NextResponse.json(
                { error: 'Invalid sender user_id' },
                { status: 400 }
            )
        }

        const broadcasterUserId = BigInt(message.broadcaster.user_id)

        // ═══════════════════════════════════════════════════════════════
        // STEP 2: CHECK FOR ACTIVE STREAM SESSION (READ-ONLY)
        // ═══════════════════════════════════════════════════════════════

        let activeSession: { id: bigint; ended_at: Date | null } | null = null
        try {
            activeSession = await db.streamSession.findFirst({
                where: {
                    broadcaster_user_id: broadcasterUserId,
                    ended_at: null,
                },
                orderBy: { started_at: 'desc' },
                select: { id: true, ended_at: true },
            })

            // Debug: Log session lookup result (only first time per minute)
            if (!activeSession) {
                logWarnRateLimited(`[chat/save] ⚠️ No active session found for broadcaster_user_id=${broadcasterUserId} (from message.broadcaster.user_id=${message.broadcaster.user_id})`)
            } else {
                // Log first successful lookup per minute
                logWarnRateLimited(`[chat/save] ✅ Found active session ${activeSession.id} for broadcaster ${broadcasterUserId}`)
            }
        } catch (error: any) {
            // Non-critical - continue without session info
            // Use rate-limited logging to prevent spam when DB is down
            const isConnectionError = error?.code === 'P1001' ||
                                    error?.message?.includes("Can't reach database server") ||
                                    error?.message?.includes('PrismaClientInitializationError')
            if (isConnectionError) {
                logWarnRateLimited('[chat/save] Database connection error - continuing without session info', error)
            } else {
                logWarnRateLimited('Failed to fetch stream session:', error)
            }
        }

        const sessionIsActive = activeSession !== null && activeSession.ended_at === null

        // ═══════════════════════════════════════════════════════════════
        // STEP 3: PREPARE JOB PAYLOAD
        // ═══════════════════════════════════════════════════════════════

        // Extract emotes from content if not provided
        let emotesToSave = message.emotes || []
        if (!Array.isArray(emotesToSave) || emotesToSave.length === 0) {
            const extractedEmotes = extractEmotesFromContent(message.content)
            if (extractedEmotes.length > 0) {
                emotesToSave = extractedEmotes
            }
        }

        const jobPayload: ChatJobPayload = {
            message_id: message.message_id,
            content: message.content,
            timestamp: message.timestamp,
            sender: {
                kick_user_id: message.sender.user_id,
                username: message.sender.username,
                profile_picture: message.sender.profile_picture,
                color: message.sender.identity?.username_color,
                badges: message.sender.identity?.badges,
                is_verified: message.sender.is_verified,
                is_anonymous: message.sender.is_anonymous,
            },
            broadcaster: {
                kick_user_id: message.broadcaster.user_id,
                username: message.broadcaster.username,
                profile_picture: message.broadcaster.profile_picture,
            },
            emotes: emotesToSave.length > 0 ? emotesToSave : null,
            stream_session_id: sessionIsActive && activeSession ? activeSession.id : null,
            is_stream_active: sessionIsActive,
        }

        // ═══════════════════════════════════════════════════════════════
        // STEP 4: ENQUEUE JOB (ONLY WRITE OPERATION)
        // ═══════════════════════════════════════════════════════════════

        const enqueueResult = await enqueueChatJob(jobPayload)

        if (!enqueueResult.success) {
            logErrorRateLimited(`[chat/save] ❌ Failed to enqueue: ${enqueueResult.error}`)
            return NextResponse.json(
                { error: 'Failed to queue message for processing' },
                { status: 500 }
            )
        }

        // ═══════════════════════════════════════════════════════════════
        // STEP 5: RETURN IMMEDIATELY
        // ═══════════════════════════════════════════════════════════════

        const duration = Date.now() - startTime

        return NextResponse.json({
            success: true,
            message: 'Message queued for processing',
            queued: true,
            duration_ms: duration,
        })

    } catch (error) {
        const duration = Date.now() - startTime

        // Filter out ECONNRESET errors (client disconnects)
        const isConnectionReset = error instanceof Error &&
            (('code' in error && (error as any).code === 'ECONNRESET') || error.message.includes('aborted'))

        if (!isConnectionReset) {
            console.error(`/api/chat/save error in ${duration}ms:`, error)
        }

        return NextResponse.json(
            { error: 'Failed to process message' },
            { status: 500 }
        )
    }
}
