import { NextResponse } from 'next/server'
import { bufferMessage, type ChatJobPayload } from '@/lib/message-buffer'
import { awardCoins, storeMessageCoinAward } from '@/lib/sweet-coins-redis'
import type { ChatMessage } from '@/lib/chat-store'
import { logErrorRateLimited } from '@/lib/rate-limited-logger'
import { db } from '@/lib/db'
import { getKickPublicKeyPem, verifyKickWebhookSignature } from '@/lib/kick-webhook'
import { logger } from '@/lib/logger'
import {
    resolveSessionForChat,
    getOrCreateActiveSession,
    touchSession,
    updateSessionMetadata,
    endActiveSessionAt,
} from '@/lib/stream-session-manager'

export const dynamic = 'force-dynamic'

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

    // Convert map to array format
    return Array.from(emotesMap.entries()).map(([emote_id, positions]) => ({
        emote_id,
        positions,
    }))
}

const EXTERNAL_WEBHOOK_URL = process.env.EXTERNAL_WEBHOOK_URL || 'https://kickdashboard.com/api/webhooks/kick'
const SKIP_SIGNATURE_VERIFY = String(process.env.KICK_WEBHOOK_SKIP_SIGNATURE_VERIFY || '').toLowerCase() === 'true'

// GET endpoint to verify webhook is accessible
export async function GET(request: Request) {
    return NextResponse.json({
        status: 'ok',
        message: 'Webhook endpoint is accessible',
        timestamp: new Date().toISOString(),
    })
}

export async function POST(request: Request) {
    try {
        const eventType = request.headers.get('Kick-Event-Type')
        const eventVersion = request.headers.get('Kick-Event-Version')

        // Signature validation headers (per Kick docs)
        const messageId = request.headers.get('Kick-Event-Message-Id')
        const messageTimestamp = request.headers.get('Kick-Event-Message-Timestamp')
        const signature = request.headers.get('Kick-Event-Signature')

        // Log all incoming webhook requests
        console.log('=== WEBHOOK RECEIVED ===')
        console.log('Event Type:', eventType)
        console.log('Event Version:', eventVersion)
        console.log('Headers:', Object.fromEntries(request.headers.entries()))
        console.log('Timestamp:', new Date().toISOString())
        console.log('URL:', request.url)
        console.log('Method:', request.method)

        // Read raw body first (needed for signature verification)
        const rawBody = await request.text()

        let payload: any = null
        try {
            payload = rawBody ? JSON.parse(rawBody) : null
        } catch (e) {
            console.warn('[webhook] ⚠️ Could not parse JSON payload')
            return NextResponse.json({ received: true, error: 'invalid_json' }, { status: 200 })
        }

        const payloadString = JSON.stringify(payload ?? {})

        console.log('Payload:', JSON.stringify(payload, null, 2))

        // Verify signature if headers are present (recommended)
        if (!SKIP_SIGNATURE_VERIFY) {
            if (!messageId || !messageTimestamp || !signature) {
                console.warn('[webhook] ⚠️ Missing signature headers; rejecting')
                return NextResponse.json({ error: 'Missing signature headers' }, { status: 401 })
            }

            const publicKey = await getKickPublicKeyPem()
            const ok = verifyKickWebhookSignature({
                messageId,
                messageTimestamp,
                rawBody,
                signatureBase64: signature,
                publicKeyPem: publicKey,
            })

            if (!ok) {
                console.warn('[webhook] ❌ Invalid signature; rejecting')
                return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
            }
        }

        // Forward to external webhook
        try {
            const forwardResponse = await fetch(EXTERNAL_WEBHOOK_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Kick-Event-Type': eventType || '',
                    'Kick-Event-Version': eventVersion || '',
                    'Kick-Event-Message-Id': messageId || '',
                    'Kick-Event-Message-Timestamp': messageTimestamp || '',
                },
                body: payloadString,
            })
            console.log('Forwarded to external webhook:', forwardResponse.status)
        } catch (forwardError) {
            console.error('Failed to forward webhook to external URL:', forwardError)
            // Continue processing even if forward fails
        }

        const parseKickTimestamp = (input: any): Date | null => {
            if (!input) return null
            if (input instanceof Date) return isNaN(input.getTime()) ? null : input
            const raw = String(input).trim()
            if (!raw) return null

            // ISO (with timezone)
            if (raw.includes('T') && (raw.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(raw))) {
                const d = new Date(raw)
                return isNaN(d.getTime()) ? null : d
            }

            // "YYYY-MM-DD HH:mm:ss" (no timezone) -> treat as UTC
            if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(raw)) {
                const d = new Date(raw.replace(' ', 'T') + 'Z')
                return isNaN(d.getTime()) ? null : d
            }

            const d = new Date(raw)
            return isNaN(d.getTime()) ? null : d
        }

        const getBroadcasterUserId = (p: any): bigint | null => {
            const raw =
                p?.broadcaster_user_id ??
                p?.broadcasterUserId ??
                p?.broadcaster?.user_id ??
                p?.broadcaster?.id ??
                p?.livestream?.broadcaster_user_id ??
                p?.data?.broadcaster_user_id ??
                null

            if (raw === null || raw === undefined) return null
            try {
                return BigInt(raw)
            } catch {
                return null
            }
        }

        const getChannelSlug = async (p: any, broadcasterUserId: bigint | null): Promise<string | null> => {
            const raw =
                p?.channel_slug ??
                p?.slug ??
                p?.channel?.slug ??
                p?.data?.channel_slug ??
                p?.data?.slug ??
                null

            if (typeof raw === 'string' && raw.trim()) return raw.trim().toLowerCase()

            if (broadcasterUserId) {
                const user = await db.user.findFirst({
                    where: { kick_user_id: broadcasterUserId },
                    select: { username: true },
                })
                if (user?.username) return user.username.trim().toLowerCase()
            }

            return null
        }

        const normalizeLivestreamStatus = (p: any): 'started' | 'ended' | null => {
            const statusRaw =
                p?.status ??
                p?.livestream_status ??
                p?.livestream?.status ??
                p?.data?.status ??
                null

            if (typeof statusRaw === 'string') {
                const s = statusRaw.trim().toLowerCase()
                if (['started', 'start', 'live', 'online', 'running'].includes(s)) return 'started'
                if (['ended', 'end', 'offline', 'stopped', 'disconnected'].includes(s)) return 'ended'
            }

            const isLiveRaw =
                p?.is_live ??
                p?.isLive ??
                p?.livestream?.is_live ??
                p?.data?.is_live ??
                null

            if (typeof isLiveRaw === 'boolean') return isLiveRaw ? 'started' : 'ended'
            if (typeof isLiveRaw === 'number') return isLiveRaw !== 0 ? 'started' : 'ended'

            // Heuristic: ended_at presence implies ended
            if (p?.ended_at || p?.endedAt || p?.data?.ended_at) return 'ended'

            return null
        }

        // Handle livestream lifecycle events (event-driven session tracking)
        if (eventType === 'livestream.status.updated') {
            const broadcasterUserId = getBroadcasterUserId(payload)
            const channelSlug = await getChannelSlug(payload, broadcasterUserId)
            const status = normalizeLivestreamStatus(payload)

            if (!broadcasterUserId || !channelSlug || !status) {
                console.warn('[webhook] livestream.status.updated missing required fields', {
                    broadcasterUserId: broadcasterUserId?.toString(),
                    channelSlug,
                    status,
                })
                return NextResponse.json({ received: true, eventType }, { status: 200 })
            }

            if (status === 'started') {
                const startedAt =
                    parseKickTimestamp(payload?.started_at) ||
                    parseKickTimestamp(payload?.livestream?.started_at) ||
                    parseKickTimestamp(payload?.data?.started_at) ||
                    null

                const thumbnailUrl =
                    (typeof payload?.thumbnail === 'string' ? payload.thumbnail : payload?.thumbnail?.url) ||
                    payload?.livestream?.thumbnail ||
                    payload?.data?.thumbnail ||
                    null

                const sessionTitle =
                    payload?.session_title ||
                    payload?.stream_title ||
                    payload?.title ||
                    payload?.livestream?.session_title ||
                    payload?.livestream?.stream_title ||
                    payload?.data?.session_title ||
                    null

                const session = await getOrCreateActiveSession(
                    broadcasterUserId,
                    channelSlug,
                    {
                        sessionTitle: typeof sessionTitle === 'string' ? sessionTitle : null,
                        thumbnailUrl: typeof thumbnailUrl === 'string' ? thumbnailUrl : null,
                        kickStreamId: null, // schema uses this for VOD ids
                        startedAt: startedAt ? startedAt.toISOString() : null,
                    },
                    startedAt ? startedAt.toISOString() : null
                )

                if (session) {
                    await touchSession(session.id)
                    logger.session('started', channelSlug, session.id)
                }

                return NextResponse.json({ received: true, eventType }, { status: 200 })
            }

            // ended
            const endedAt =
                parseKickTimestamp(payload?.ended_at) ||
                parseKickTimestamp(payload?.livestream?.ended_at) ||
                parseKickTimestamp(payload?.data?.ended_at) ||
                parseKickTimestamp(payload?.timestamp) ||
                parseKickTimestamp(messageTimestamp) ||
                new Date()

            // Force end: Kick webhook is authoritative and shouldn't be blocked by grace period
            const ended = await endActiveSessionAt(broadcasterUserId, endedAt, true)
            if (ended) {
                logger.session('ended', channelSlug || 'unknown', broadcasterUserId.toString())
            }
            return NextResponse.json({ received: true, eventType }, { status: 200 })
        }

        // Optional: metadata updates during live
        if (eventType === 'livestream.metadata.updated') {
            const broadcasterUserId = getBroadcasterUserId(payload)
            const channelSlug = await getChannelSlug(payload, broadcasterUserId)
            if (!broadcasterUserId || !channelSlug) {
                return NextResponse.json({ received: true, eventType }, { status: 200 })
            }

            const sessionTitle =
                payload?.session_title ||
                payload?.stream_title ||
                payload?.title ||
                payload?.livestream?.session_title ||
                payload?.livestream?.stream_title ||
                payload?.data?.session_title ||
                null

            const thumbnailUrl =
                (typeof payload?.thumbnail === 'string' ? payload.thumbnail : payload?.thumbnail?.url) ||
                payload?.livestream?.thumbnail ||
                payload?.data?.thumbnail ||
                null

            // Best-effort update for active session
            const session = await getOrCreateActiveSession(broadcasterUserId, channelSlug)
            if (session) {
                await updateSessionMetadata(session.id, {
                    sessionTitle: typeof sessionTitle === 'string' ? sessionTitle : undefined,
                    thumbnailUrl: typeof thumbnailUrl === 'string' ? thumbnailUrl : undefined,
                })
                await touchSession(session.id)
            }

            return NextResponse.json({ received: true, eventType }, { status: 200 })
        }

        // Only handle chat.message.sent events locally beyond this point
        if (eventType !== 'chat.message.sent') {
            console.log('Event type not handled locally, ignoring:', eventType)
            return NextResponse.json({ received: true, eventType }, { status: 200 })
        }

        console.log('Processing chat.message.sent event...')

        // Validate payload structure
        if (!payload.message_id || !payload.sender || !payload.content) {
            console.error('❌ Invalid payload structure:', JSON.stringify(payload, null, 2))
            return NextResponse.json(
                { error: 'Invalid payload structure', received: true },
                { status: 200 }
            )
        }

        const messagePayload = payload as Omit<ChatMessage, 'timestamp'>
        const message: ChatMessage = {
            ...messagePayload,
            timestamp: Date.now(),
        }

        console.log('[webhook] 📝 Received message:', {
            message_id: message.message_id,
            sender: message.sender?.username,
            broadcaster: message.broadcaster?.username,
            content: message.content?.substring(0, 50),
        })

        // ═══════════════════════════════════════════════════════════════
        // RESOLVE STREAM SESSION FOR MESSAGE (READ-ONLY)
        // ═══════════════════════════════════════════════════════════════
        // Resolves to active session or recently ended session (within 2m window)

        const broadcasterUserId = BigInt(message.broadcaster.user_id)
        const messageTimestampMs = typeof message.timestamp === 'number'
            ? message.timestamp
            : typeof message.timestamp === 'string'
                ? parseInt(message.timestamp, 10)
                : Date.now()

        let resolvedSession: { sessionId: bigint; isActive: boolean } | null = null

        try {
            resolvedSession = await resolveSessionForChat(broadcasterUserId, messageTimestampMs)
            if (!resolvedSession) {
                console.log(`[webhook] No session found for broadcaster ${broadcasterUserId} at timestamp ${messageTimestampMs}`)
            } else {
                console.log(`[webhook] Resolved session ${resolvedSession.sessionId} (active: ${resolvedSession.isActive}) for broadcaster ${broadcasterUserId}`)
            }
        } catch (error: any) {
            // Non-critical - continue without session info
            const isConnectionError = error?.code === 'P1001' ||
                                    error?.message?.includes("Can't reach database server") ||
                                    error?.message?.includes('PrismaClientInitializationError')
            if (isConnectionError) {
                console.warn('[webhook] Database connection error - continuing without session info')
            } else {
                console.warn('[webhook] Failed to resolve stream session:', error)
            }
        }

        const sessionIsActive = resolvedSession?.isActive ?? false

        // ═══════════════════════════════════════════════════════════════
        // PREPARE JOB PAYLOAD
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
            stream_session_id: resolvedSession?.sessionId ?? null,
            is_stream_active: sessionIsActive,
        }

        // ═══════════════════════════════════════════════════════════════
        // BUFFER MESSAGE IN REDIS (INSTANT - < 1ms)
        // ═══════════════════════════════════════════════════════════════

        const bufferResult = await bufferMessage(jobPayload)

        if (!bufferResult.success) {
            logErrorRateLimited(`[webhook] ❌ Failed to buffer message: ${bufferResult.error}`)
            return NextResponse.json(
                { error: 'Failed to buffer message for processing', received: true },
                { status: 500 }
            )
        }

        // ═══════════════════════════════════════════════════════════════
        // AWARD SWEET COINS INSTANTLY (IF STREAM IS ACTIVE)
        // ═══════════════════════════════════════════════════════════════
        // Note: This is non-blocking - coins are awarded instantly via Redis
        // Actual DB sync happens in redis-sync worker

        if (sessionIsActive && jobPayload.stream_session_id) {
            console.log(`[webhook] Awarding coins to @${jobPayload.sender.username} for session ${jobPayload.stream_session_id}`)
            // Award coins instantly via Redis (non-blocking)
            const sessionId = jobPayload.stream_session_id

            // Upsert user to ensure they exist (fixes first-time chatters missing coins)
            const user = await db.user.upsert({
                where: { kick_user_id: senderKickUserId },
                update: {
                    username: jobPayload.sender.username,
                    profile_picture_url: jobPayload.sender.profile_picture || undefined,
                },
                create: {
                    kick_user_id: senderKickUserId,
                    username: jobPayload.sender.username,
                    profile_picture_url: jobPayload.sender.profile_picture || null,
                },
                select: { id: true, is_excluded: true, username: true, kick_connected: true },
            })

            if (!user.is_excluded &&
                user.username.toLowerCase() !== 'sweetflipsbot' &&
                user.kick_connected !== false) {
                // Award coins instantly via Redis
                const isSub = jobPayload.sender.badges?.some(badge =>
                    ['subscriber', 'sub_gifter', 'founder', 'sub'].some(type =>
                        badge.type?.toLowerCase().includes(type) || badge.text?.toLowerCase().includes('sub')
                    )
                ) || false

                const coinsToAward = isSub ? 1 : 1 // Same for now, can be configured later

                try {
                    const coinResult = await awardCoins(user.id, coinsToAward, sessionId)

                    if (coinResult.awarded) {
                        // Add coin info to the buffered message payload so it's visible in real-time
                        // This will be included when the message is processed and displayed
                        jobPayload.sweet_coins_earned = coinsToAward
                        jobPayload.sweet_coins_reason = 'chat_message'

                        // Store in Redis for instant UI updates (keyed by message_id)
                        await storeMessageCoinAward(jobPayload.message_id, coinsToAward)

                        // Structured logging
                        logger.coin(
                            jobPayload.sender.username,
                            coinsToAward,
                            coinResult.newBalance,
                            sessionId
                        )
                    }
                } catch (err) {
                    logger.log('COIN', `Error awarding coins to @${jobPayload.sender.username}`, {
                        error: err instanceof Error ? err.message : 'Unknown error',
                    })
                }
            }
        } else {
            // Log why coins weren't awarded - helps diagnose issues
            if (!sessionIsActive) {
                console.log(`[webhook] Not awarding coins to @${jobPayload.sender.username} - no active session`)
            } else if (!jobPayload.stream_session_id) {
                console.log(`[webhook] Not awarding coins to @${jobPayload.sender.username} - no stream_session_id`)
            }
        }

        return NextResponse.json({ received: true, message: 'Chat message buffered for processing' }, { status: 200 })
    } catch (error) {
        console.error('❌ Webhook error:', error)
        console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace')
        return NextResponse.json(
            { error: 'Failed to process webhook', details: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        )
    }
}
