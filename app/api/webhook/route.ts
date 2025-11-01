import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { isBot, awardPoint, awardEmotes } from '@/lib/points'
import { getActiveGiveaway, isUserEligible } from '@/lib/giveaway'
import type { ChatMessage } from '@/lib/chat-store'

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

const EXTERNAL_WEBHOOK_URL = process.env.EXTERNAL_WEBHOOK_URL || 'https://www.sweetflipsrewards.com/api/webhooks/kick'

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

        console.log('📝 Message before adding:', {
            message_id: message.message_id,
            sender: message.sender?.username,
            content: message.content?.substring(0, 50),
        })

        // Save to database
        try {
            const senderUserId = BigInt(message.sender.user_id)
            const broadcasterUserId = BigInt(message.broadcaster.user_id)

            // Find or create sender user
            let senderUser
            try {
                senderUser = await db.user.upsert({
                    where: { kick_user_id: senderUserId },
                    update: {
                        username: message.sender.username,
                        profile_picture_url: message.sender.profile_picture || null,
                    },
                    create: {
                        kick_user_id: senderUserId,
                        username: message.sender.username,
                        profile_picture_url: message.sender.profile_picture || null,
                    },
                })
            } catch (error) {
                console.error(`❌ Failed to upsert sender user ${senderUserId}:`, error)
                throw error
            }

            // Find or create broadcaster user
            let broadcasterUser
            try {
                broadcasterUser = await db.user.upsert({
                    where: { kick_user_id: broadcasterUserId },
                    update: {
                        username: message.broadcaster.username,
                        profile_picture_url: message.broadcaster.profile_picture || null,
                    },
                    create: {
                        kick_user_id: broadcasterUserId,
                        username: message.broadcaster.username,
                        profile_picture_url: message.broadcaster.profile_picture || null,
                    },
                })
            } catch (error) {
                console.error(`❌ Failed to upsert broadcaster user ${broadcasterUserId}:`, error)
                throw error
            }

            // Find active stream session for this broadcaster
            let activeSession = await db.streamSession.findFirst({
                where: {
                    broadcaster_user_id: broadcasterUserId,
                    ended_at: null,
                },
                orderBy: { started_at: 'desc' },
            })

            // If no active session exists, check if stream is live and create session if needed
            if (!activeSession) {
                console.log(`🔍 No active session found for broadcaster ${broadcasterUserId} - checking stream status...`)
                try {
                    // Get broadcaster username from message or fetch from database
                    const broadcasterSlug = message.broadcaster.channel_slug || broadcasterUser.username.toLowerCase()
                    console.log(`📡 Checking Kick API for channel: ${broadcasterSlug}`)

                    // Check Kick API to see if stream is live
                    const controller = new AbortController()
                    const timeoutId = setTimeout(() => controller.abort(), 5000) // 5 second timeout

                    const channelResponse = await fetch(
                        `https://kick.com/api/v2/channels/${broadcasterSlug}`,
                        {
                            headers: {
                                'Accept': 'application/json',
                                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                            },
                            signal: controller.signal,
                        }
                    )

                    clearTimeout(timeoutId)

                    if (channelResponse.ok) {
                        const channelData = await channelResponse.json()
                        const livestream = channelData.livestream
                        const isLive = livestream?.is_live === true
                        const viewerCount = isLive ? (livestream?.viewer_count ?? 0) : 0
                        const streamTitle = livestream?.session_title || ''

                        console.log(`📊 Stream status: ${isLive ? 'LIVE' : 'OFFLINE'} (viewers: ${viewerCount})`)

                        let thumbnailUrl: string | null = null
                        if (livestream?.thumbnail) {
                            if (typeof livestream.thumbnail === 'string') {
                                thumbnailUrl = livestream.thumbnail
                            } else if (typeof livestream.thumbnail === 'object' && livestream.thumbnail.url) {
                                thumbnailUrl = livestream.thumbnail.url
                            }
                        }

                        if (isLive) {
                            // Stream is live but no session exists - create one
                            activeSession = await db.streamSession.create({
                                data: {
                                    broadcaster_user_id: broadcasterUserId,
                                    channel_slug: broadcasterSlug,
                                    session_title: streamTitle || null,
                                    thumbnail_url: thumbnailUrl,
                                    started_at: new Date(),
                                    peak_viewer_count: viewerCount,
                                },
                            })
                            console.log(`✅ Stream is LIVE - created session ${activeSession.id} - points will now count!`)
                        } else {
                            console.log(`ℹ️ Stream is OFFLINE - no session created, points will not be awarded`)
                        }
                    } else {
                        console.warn(`⚠️ Kick API returned ${channelResponse.status} - cannot verify stream status`)
                    }
                } catch (checkError) {
                    // If we can't check stream status, assume offline
                    console.warn(`⚠️ Could not check stream status for broadcaster ${broadcasterUserId}:`, checkError instanceof Error ? checkError.message : 'Unknown error')
                }
            } else {
                console.log(`✅ Active session found: ${activeSession.id} - points will count`)
            }

            // Determine if message was sent when offline
            const sentWhenOffline = !activeSession

            // If there's an active session, double-check it's still active (prevent race conditions)
            let sessionIsActive = false
            if (activeSession) {
                const sessionCheck = await db.streamSession.findUnique({
                    where: { id: activeSession.id },
                    select: { ended_at: true },
                })
                sessionIsActive = sessionCheck !== null && sessionCheck.ended_at === null
            }

            // Calculate points earned (only when stream is active)
            const senderUsername = message.sender.username.toLowerCase()
            let pointsEarned = 0
            if (!sentWhenOffline && sessionIsActive && !isBot(senderUsername)) {
                const pointResult = await awardPoint(
                    senderUserId,
                    activeSession!.id,
                    message.message_id,
                    message.sender.identity?.badges
                )
                pointsEarned = pointResult.pointsEarned || 0
                if (pointResult.awarded) {
                    console.log(`✅ Awarded ${pointsEarned} point(s) to ${message.sender.username}`)
                } else {
                    console.log(`⏸️ Point not awarded to ${message.sender.username}: ${pointResult.reason}`)
                }
            } else {
                if (sentWhenOffline) {
                    console.log(`ℹ️ Message sent when stream is offline - no points awarded`)
                } else if (isBot(senderUsername)) {
                    console.log(`🤖 Skipped points for bot: ${message.sender.username}`)
                }
            }

            // Extract emotes from content if not provided separately
            let emotesToSave = message.emotes || []
            if (!Array.isArray(emotesToSave) || emotesToSave.length === 0) {
                // Try to extract emotes from content [emote:ID:Name] format
                const extractedEmotes = extractEmotesFromContent(message.content)
                if (extractedEmotes.length > 0) {
                    emotesToSave = extractedEmotes
                } else {
                    emotesToSave = []
                }
            }

            // Count and track emotes (only when stream is live)
            // Skip counting emotes from messages sent by bots or when offline
            if (emotesToSave.length > 0 && !sentWhenOffline && sessionIsActive && !isBot(senderUsername)) {
                try {
                    await awardEmotes(senderUserId, emotesToSave)
                } catch (emoteError) {
                    // Don't fail message save if emote award fails
                    console.warn('Failed to award emotes (non-critical):', emoteError)
                }
            }

            // Save message to database (use upsert to handle duplicates gracefully)
            // Always save messages, even when offline
            await db.chatMessage.upsert({
                where: { message_id: message.message_id },
                update: {
                    // Update with latest data if message already exists
                    stream_session_id: sessionIsActive ? activeSession!.id : null,
                    sender_username: message.sender.username,
                    content: message.content,
                    emotes: emotesToSave,
                    timestamp: BigInt(message.timestamp),
                    sender_username_color: message.sender.identity?.username_color || null,
                    sender_badges: message.sender.identity?.badges || undefined,
                    sender_is_verified: message.sender.is_verified || false,
                    sender_is_anonymous: message.sender.is_anonymous || false,
                    points_earned: pointsEarned,
                    sent_when_offline: sentWhenOffline,
                },
                create: {
                    message_id: message.message_id,
                    stream_session_id: sessionIsActive ? activeSession!.id : null,
                    sender_user_id: senderUserId,
                    sender_username: message.sender.username,
                    broadcaster_user_id: broadcasterUserId,
                    content: message.content,
                    emotes: emotesToSave,
                    timestamp: BigInt(message.timestamp),
                    sender_username_color: message.sender.identity?.username_color || null,
                    sender_badges: message.sender.identity?.badges || undefined,
                    sender_is_verified: message.sender.is_verified || false,
                    sender_is_anonymous: message.sender.is_anonymous || false,
                    points_earned: pointsEarned,
                    sent_when_offline: sentWhenOffline,
                },
            })

            // Update stream session message count if session exists and is active
            if (sessionIsActive && activeSession) {
                const messageCount = await db.chatMessage.count({
                    where: { stream_session_id: activeSession.id },
                })
                await db.streamSession.update({
                    where: { id: activeSession.id },
                    data: {
                        total_messages: messageCount,
                        updated_at: new Date(),
                    },
                })
            }

            // Auto-entry for active giveaways - update entry points as user earns more
            // Only process when stream is active
            if (!isBot(senderUsername) && sessionIsActive && activeSession) {
                try {
                    const activeGiveaway = await getActiveGiveaway(broadcasterUserId, activeSession.id)
                    if (activeGiveaway && activeGiveaway.stream_session_id === activeSession.id) {
                        // Check if user is eligible based on stream session points
                        const eligible = await isUserEligible(senderUserId, activeGiveaway.entry_min_points, activeSession.id)
                        if (eligible) {
                            // Get user's current points from this stream session
                            const sessionPointsResult = await db.pointHistory.aggregate({
                                where: {
                                    stream_session_id: activeSession.id,
                                    user_id: senderUser.id,
                                },
                                _sum: {
                                    points_earned: true,
                                },
                            })

                            const sessionPoints = sessionPointsResult._sum.points_earned || 0

                            if (sessionPoints >= activeGiveaway.entry_min_points) {
                                // Upsert entry - update points if exists, create if not
                                await db.giveawayEntry.upsert({
                                    where: {
                                        giveaway_id_user_id: {
                                            giveaway_id: activeGiveaway.id,
                                            user_id: senderUser.id,
                                        },
                                    },
                                    update: {
                                        points_at_entry: sessionPoints, // Update tickets as points increase
                                    },
                                    create: {
                                        giveaway_id: activeGiveaway.id,
                                        user_id: senderUser.id,
                                        points_at_entry: sessionPoints,
                                    },
                                })
                                console.log(`🎁 Updated ${message.sender.username} giveaway entry: ${sessionPoints} tickets`)
                            }
                        }
                    }
                } catch (giveawayError) {
                    // Don't fail the entire request if giveaway entry fails
                    console.error('Error processing giveaway auto-entry:', giveawayError)
                }
            }

            console.log(`✅ Saved message to database: ${message.message_id} (sent_when_offline: ${sentWhenOffline})`)
        } catch (dbError) {
            console.error('❌ Error saving message to database:', dbError)
            return NextResponse.json(
                { error: 'Failed to save message to database', details: dbError instanceof Error ? dbError.message : 'Unknown error' },
                { status: 500 }
            )
        }

        return NextResponse.json({ received: true, message: 'Chat message processed and saved to database' }, { status: 200 })
    } catch (error) {
        console.error('❌ Webhook error:', error)
        console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace')
        return NextResponse.json(
            { error: 'Failed to process webhook', details: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        )
    }
}
