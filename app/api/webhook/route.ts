import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { enqueueChatJob, type ChatJobPayload } from '@/lib/chat-queue'
import type { ChatMessage } from '@/lib/chat-store'

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

        // Log all incoming webhook requests
        console.log('=== WEBHOOK RECEIVED ===')
        console.log('Event Type:', eventType)
        console.log('Event Version:', eventVersion)
        console.log('Headers:', Object.fromEntries(request.headers.entries()))
        console.log('Timestamp:', new Date().toISOString())
        console.log('URL:', request.url)
        console.log('Method:', request.method)

        // Get the raw body to forward it
        const payload = await request.json()
        const payloadString = JSON.stringify(payload)

        console.log('Payload:', JSON.stringify(payload, null, 2))

        // Forward to external webhook
        try {
            const forwardResponse = await fetch(EXTERNAL_WEBHOOK_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Kick-Event-Type': eventType || '',
                    'Kick-Event-Version': eventVersion || '',
                },
                body: payloadString,
            })
            console.log('Forwarded to external webhook:', forwardResponse.status)
        } catch (forwardError) {
            console.error('Failed to forward webhook to external URL:', forwardError)
            // Continue processing even if forward fails
        }

        // Only handle chat.message.sent events locally
        if (eventType !== 'chat.message.sent') {
            console.log('Event type is not chat.message.sent, ignoring:', eventType)
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
        // CHECK FOR ACTIVE STREAM SESSION (READ-ONLY)
        // ═══════════════════════════════════════════════════════════════

        const broadcasterUserId = BigInt(message.broadcaster.user_id)
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
        } catch (error: any) {
            // Non-critical - continue without session info
            const isConnectionError = error?.code === 'P1001' ||
                                    error?.message?.includes("Can't reach database server") ||
                                    error?.message?.includes('PrismaClientInitializationError')
            if (isConnectionError) {
                console.warn('[webhook] Database connection error - continuing without session info')
            } else {
                console.warn('[webhook] Failed to fetch stream session:', error)
            }
        }

        const sessionIsActive = activeSession !== null && activeSession.ended_at === null

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
            stream_session_id: sessionIsActive && activeSession ? activeSession.id : null,
            is_stream_active: sessionIsActive,
        }

        // ═══════════════════════════════════════════════════════════════
        // ENQUEUE JOB FOR WORKER PROCESSING
        // ═══════════════════════════════════════════════════════════════

        console.log(`[webhook] 📤 Enqueueing job for message ${jobPayload.message_id} from ${jobPayload.sender.username} (session: ${jobPayload.stream_session_id || 'none'})`)

        const enqueueResult = await enqueueChatJob(jobPayload)

        if (!enqueueResult.success) {
            console.error(`[webhook] ❌ Failed to enqueue: ${enqueueResult.error}`)
            return NextResponse.json(
                { error: 'Failed to queue message for processing', received: true },
                { status: 500 }
            )
        }

        console.log(`[webhook] ✅ Job enqueued successfully for ${jobPayload.sender.username}`)

        return NextResponse.json({ received: true, message: 'Chat message queued for processing' }, { status: 200 })
    } catch (error) {
        console.error('❌ Webhook error:', error)
        console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace')
        return NextResponse.json(
            { error: 'Failed to process webhook', details: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        )
    }
}
