import type { ChatMessage } from '@/lib/chat-store';
import { db } from '@/lib/db';
import { logErrorRateLimited, logWarnRateLimited } from '@/lib/rate-limited-logger';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic'
export const maxDuration = 30

// In-memory DB circuit breaker to avoid request storms when Postgres is down.
// This is per-instance (fine) and intentionally simple.
let dbCircuitOpenUntil = 0
let dbCircuitBackoffMs = 1000

function isDbCircuitOpen() {
    return Date.now() < dbCircuitOpenUntil
}

function openDbCircuit() {
    const now = Date.now()
    dbCircuitOpenUntil = now + dbCircuitBackoffMs
    dbCircuitBackoffMs = Math.min(dbCircuitBackoffMs * 2, 30_000)
}

function closeDbCircuit() {
    dbCircuitOpenUntil = 0
    dbCircuitBackoffMs = 1000
}

function isRetryableDbError(error: any) {
    return (
        error?.code === 'P1001' ||
        error?.code === 'P2024' ||
        error?.code === 'P2028' ||
        error?.message?.includes("Can't reach database server") ||
        error?.message?.includes('PrismaClientInitializationError') ||
        error?.message?.includes('connection pool') ||
        error?.message?.includes('Unable to start a transaction')
    )
}

// Small cache for stream-session lookups to avoid querying on every chat message
type ActiveSession = { id: bigint; ended_at: Date | null } | null
const activeSessionCache = new Map<string, { value: ActiveSession; expiresAt: number }>()

async function getCachedActiveSession(broadcasterUserId: bigint): Promise<ActiveSession> {
    const key = broadcasterUserId.toString()
    const cached = activeSessionCache.get(key)
    const now = Date.now()
    if (cached && cached.expiresAt > now) return cached.value

    if (isDbCircuitOpen()) {
        activeSessionCache.set(key, { value: null, expiresAt: now + 2000 })
        return null
    }

    try {
        const value = await db.streamSession.findFirst({
            where: {
                broadcaster_user_id: broadcasterUserId,
                ended_at: null,
            },
            orderBy: { started_at: 'desc' },
            select: { id: true, ended_at: true },
        })
        activeSessionCache.set(key, { value, expiresAt: now + 5000 })
        return value
    } catch (error: any) {
        if (isRetryableDbError(error)) {
            openDbCircuit()
        }
        activeSessionCache.set(key, { value: null, expiresAt: now + 2000 })
        return null
    }
}

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

function toFiniteInt(value: any): number | null {
    const n = typeof value === 'string' ? Number(value) : value
    if (!Number.isFinite(n)) return null
    const int = Math.trunc(n)
    return Number.isFinite(int) ? int : null
}

export async function POST(request: Request) {
    const startTime = Date.now()
    try {
        let body: any
        try {
            body = await request.json()
        } catch {
            return NextResponse.json({ error: 'Invalid JSON in request body' }, { status: 400 })
        }

        const messages: any[] =
            Array.isArray(body) ? body :
            Array.isArray(body?.messages) ? body.messages :
            body ? [body] : []

        if (messages.length === 0) {
            return NextResponse.json({ error: 'No messages provided' }, { status: 400 })
        }

        // If DB is currently unhealthy, fail soft to avoid spamming the origin and creating more load.
        if (isDbCircuitOpen()) {
            return NextResponse.json({
                success: false,
                queued: false,
                degraded: true,
                error: 'Database temporarily unavailable',
            }, { status: 200 })
        }

        // ═══════════════════════════════════════════════════════════════
        // STEP 1: VALIDATE MESSAGE STRUCTURE
        // ═══════════════════════════════════════════════════════════════
        const isBatch = messages.length > 1
        const validMessages: ChatMessage[] = []
        let skipped = 0

        for (const raw of messages) {
            const message = raw as ChatMessage

            if (!message?.message_id || typeof message.message_id !== 'string' || message.message_id.trim() === '') {
                if (!isBatch) {
                    return NextResponse.json({ error: 'Invalid message structure: message_id is required' }, { status: 400 })
                }
                skipped++
                continue
            }

            if (!message?.sender || !message?.content || !message?.broadcaster) {
                if (!isBatch) {
                    return NextResponse.json({ error: 'Invalid message structure: sender, content, and broadcaster are required' }, { status: 400 })
                }
                skipped++
                continue
            }

            const senderUserId = toFiniteInt((message as any).sender?.user_id)
            const broadcasterUserId = toFiniteInt((message as any).broadcaster?.user_id)
            if (!senderUserId || senderUserId <= 0 || !broadcasterUserId || broadcasterUserId <= 0) {
                if (!isBatch) {
                    return NextResponse.json({ error: 'Invalid sender/broadcaster user_id' }, { status: 400 })
                }
                skipped++
                continue
            }

            validMessages.push(message)
        }

        if (validMessages.length === 0) {
            return NextResponse.json(
                { success: false, queued: false, error: 'No valid messages to process', skipped },
                { status: 400 }
            )
        }

        // ═══════════════════════════════════════════════════════════════
        // STEP 2: CHECK FOR ACTIVE STREAM SESSION (READ-ONLY, CACHED)
        // ═══════════════════════════════════════════════════════════════
        // Resolve active sessions once per broadcaster per few seconds.
        // For a batch, this is still cheap due to caching.
        const activeSessionByBroadcaster = new Map<string, ActiveSession>()
        for (const msg of validMessages) {
            const bId = BigInt(toFiniteInt((msg as any).broadcaster?.user_id) || 0)
            const key = bId.toString()
            if (!activeSessionByBroadcaster.has(key)) {
                const activeSession = await getCachedActiveSession(bId)
                activeSessionByBroadcaster.set(key, activeSession)

                if (!activeSession) {
                    logWarnRateLimited(`[chat/save] ⚠️ No active session found for broadcaster_user_id=${key}`)
                } else {
                    logWarnRateLimited(`[chat/save] ✅ Found active session ${activeSession.id} for broadcaster ${key}`)
                }
            }
        }

        // ═══════════════════════════════════════════════════════════════
        // STEP 3: PREPARE JOB PAYLOAD
        // ═══════════════════════════════════════════════════════════════
        const jobsToCreate = validMessages.map((message) => {
            const senderUserId = toFiniteInt((message as any).sender?.user_id) || 0
            const broadcasterUserIdNum = toFiniteInt((message as any).broadcaster?.user_id) || 0
            const broadcasterUserId = BigInt(broadcasterUserIdNum)
            const activeSession = activeSessionByBroadcaster.get(broadcasterUserId.toString()) ?? null
            const sessionIsActive = activeSession !== null && activeSession.ended_at === null

            // Extract emotes from content if not provided
            let emotesToSave = (message as any).emotes || []
            if (!Array.isArray(emotesToSave) || emotesToSave.length === 0) {
                const extractedEmotes = extractEmotesFromContent(message.content)
                if (extractedEmotes.length > 0) {
                    emotesToSave = extractedEmotes
                }
            }

            const payload = {
                message_id: message.message_id,
                content: message.content,
                timestamp: message.timestamp,
                sender: {
                    kick_user_id: senderUserId,
                    username: message.sender.username,
                    profile_picture: message.sender.profile_picture,
                    color: message.sender.identity?.username_color,
                    badges: message.sender.identity?.badges,
                    is_verified: message.sender.is_verified,
                    is_anonymous: message.sender.is_anonymous,
                },
                broadcaster: {
                    kick_user_id: broadcasterUserIdNum,
                    username: message.broadcaster.username,
                    profile_picture: message.broadcaster.profile_picture,
                },
                emotes: emotesToSave.length > 0 ? emotesToSave : null,
                stream_session_id: sessionIsActive && activeSession ? activeSession.id : null,
                is_stream_active: sessionIsActive,
            }

            return {
                message_id: message.message_id,
                payload: payload as any,
                sender_user_id: BigInt(senderUserId),
                broadcaster_user_id: BigInt(broadcasterUserIdNum),
                stream_session_id: sessionIsActive && activeSession ? activeSession.id : null,
                status: 'pending',
            }
        })

        // ═══════════════════════════════════════════════════════════════
        // STEP 4: ENQUEUE JOBS (BATCHED WRITE)
        // ═══════════════════════════════════════════════════════════════
        let createdCount = 0
        try {
            const result = await db.chatJob.createMany({
                data: jobsToCreate,
                skipDuplicates: true,
            })
            createdCount = result.count || 0
            closeDbCircuit()
        } catch (error: any) {
            if (isRetryableDbError(error)) {
                openDbCircuit()
            }
            logErrorRateLimited(`[chat/save] ❌ Failed to enqueue ${jobsToCreate.length} jobs`, error)
            // Fail soft: don't break chat UI or create storms; the worker can't process anyway if DB is down.
            return NextResponse.json({
                success: false,
                queued: false,
                degraded: true,
                error: 'Failed to queue message(s) for processing',
                attempted: jobsToCreate.length,
                skipped,
            }, { status: 200 })
        }

        // ═══════════════════════════════════════════════════════════════
        // STEP 5: RETURN IMMEDIATELY
        // ═══════════════════════════════════════════════════════════════

        const duration = Date.now() - startTime

        return NextResponse.json({
            success: true,
            message: 'Message(s) queued for processing',
            queued: true,
            created: createdCount,
            received: messages.length,
            accepted: validMessages.length,
            skipped,
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

        if (isRetryableDbError(error)) {
            openDbCircuit()
        }

        // Fail soft to avoid creating a retry storm when the origin is unhealthy.
        return NextResponse.json({
            success: false,
            queued: false,
            degraded: true,
            error: 'Failed to process message(s)',
        }, { status: 200 })
    }
}
