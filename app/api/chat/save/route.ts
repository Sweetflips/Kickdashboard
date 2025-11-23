import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { isBot, awardPoint, awardEmotes } from '@/lib/points'
import { getActiveGiveaway, isUserEligible } from '@/lib/giveaway'
import { detectBotMessage } from '@/lib/bot-detection'
import { Prisma } from '@prisma/client'
import type { ChatMessage } from '@/lib/chat-store'

const verboseChatLogging = process.env.CHAT_SAVE_VERBOSE_LOGS === 'true'
const requestLoggingEnabled = process.env.CHAT_SAVE_LOG_REQUESTS !== 'false'

const logDebug = (...args: Parameters<typeof console.debug>) => {
    if (verboseChatLogging) {
        console.debug(...args)
    }
}

const logRequest = (...args: Parameters<typeof console.info>) => {
    if (requestLoggingEnabled) {
        console.info(...args)
    }
}

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

export async function POST(request: Request) {
    const startTime = Date.now()
    try {
        const body = await request.json()
        const message = body as ChatMessage

        // Validate message structure - message_id is required and must be non-empty
        if (!message.message_id || typeof message.message_id !== 'string' || message.message_id.trim() === '') {
            console.error('Invalid message structure: missing or invalid message_id', {
                has_message_id: !!message.message_id,
                message_id_type: typeof message.message_id,
                message_id_value: message.message_id ? message.message_id.substring(0, 50) : null,
                has_sender: !!message.sender,
                has_content: !!message.content,
                sender_user_id: message.sender?.user_id,
                content_preview: message.content ? message.content.substring(0, 50) : null,
            })
            return NextResponse.json(
                { error: 'Invalid message structure: message_id is required and must be a non-empty string' },
                { status: 400 }
            )
        }

        if (!message.sender || !message.content) {
            console.error('Invalid message structure:', {
                has_message_id: !!message.message_id,
                has_sender: !!message.sender,
                has_content: !!message.content
            })
            return NextResponse.json(
                { error: 'Invalid message structure' },
                { status: 400 }
            )
        }

        // Additional validation: check for suspicious message IDs (too short, repeated patterns)
        const messageId = message.message_id.trim()
        if (messageId.length < 5) {
            console.warn('⚠️ Suspiciously short message_id detected:', {
                message_id: messageId,
                sender: message.sender?.username,
                content_preview: message.content?.substring(0, 50),
            })
        }

        const senderUserId = BigInt(message.sender.user_id)
        const broadcasterUserId = BigInt(message.broadcaster.user_id)
        const senderUsername = message.sender.username

        // Skip if user_id is invalid (0 or negative)
        if (message.sender.user_id <= 0) {
            console.warn('Invalid sender user_id:', message.sender.user_id)
            return NextResponse.json({ success: false, message: 'Invalid sender user_id' }, { status: 400 })
        }

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
            console.error('Failed to upsert sender user:', error)
            return NextResponse.json(
                { error: 'Failed to create/update sender user' },
                { status: 500 }
            )
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
            console.error('Failed to upsert broadcaster user:', error)
            return NextResponse.json(
                { error: 'Failed to create/update broadcaster user' },
                { status: 500 }
            )
        }

        // Find active stream session for this broadcaster
        let activeSession = await db.streamSession.findFirst({
            where: {
                broadcaster_user_id: broadcasterUserId,
                ended_at: null,
            },
            orderBy: { started_at: 'desc' },
        })

        // If active session exists but has no thumbnail, try to fetch and update it
        if (activeSession && !activeSession.thumbnail_url) {
            try {
                const broadcasterSlug = message.broadcaster.channel_slug || broadcasterUser.username.toLowerCase()
                const controller = new AbortController()
                const timeoutId = setTimeout(() => controller.abort(), 5000)

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
                    let thumbnailUrl: string | null = null

                    if (livestream?.thumbnail) {
                        if (typeof livestream.thumbnail === 'string') {
                            thumbnailUrl = livestream.thumbnail
                        } else if (typeof livestream.thumbnail === 'object' && livestream.thumbnail.url) {
                            thumbnailUrl = livestream.thumbnail.url
                        }
                    }

                    if (thumbnailUrl) {
                        await db.streamSession.update({
                            where: { id: activeSession!.id },
                            data: { thumbnail_url: thumbnailUrl },
                        })
                        activeSession.thumbnail_url = thumbnailUrl
                        logDebug(`✅ Updated thumbnail for session ${activeSession.id}`)
                    }
                }
            } catch (updateError) {
                // Non-critical - just log and continue
                logDebug(`⚠️ Could not update thumbnail for session ${activeSession.id}:`, updateError)
            }
        }

        // If no active session exists, check if stream is live and create session if needed
        if (!activeSession) {
            try {
                // Get broadcaster username from message
                const broadcasterSlug = message.broadcaster.channel_slug || broadcasterUser.username.toLowerCase()

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
                        logDebug(`✅ Stream is live but no session existed - created session ${activeSession.id}`)
                    }
                }
            } catch (checkError) {
                // If we can't check stream status, assume offline
                console.warn(`⚠️ Could not check stream status for broadcaster ${broadcasterUserId}:`, checkError instanceof Error ? checkError.message : 'Unknown error')
            }
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

        // Save message to database using create-first pattern for idempotency
        // ALWAYS save messages, even when offline or if other operations fail
        try {
            // Log emotes structure for debugging (only occasionally)
            if (emotesToSave.length > 0 && Math.random() < 0.01) {
                logDebug('💾 Saving message with emotes:', {
                    message_id: message.message_id,
                    sender: message.sender.username,
                    emotes_count: emotesToSave.length,
                    emotes_structure: emotesToSave[0],
                    has_positions: emotesToSave[0]?.positions?.length > 0,
                })
            }

            let isNewMessage = false
            let pointsEarned = 0
            let pointsReason: string | null = null
            const senderUsernameLower = senderUsername.toLowerCase()

            if (sentWhenOffline) {
                const existingOfflineMessage = await db.offlineChatMessage.findUnique({
                    where: { message_id: message.message_id },
                })

                if (existingOfflineMessage) {
                    await db.offlineChatMessage.update({
                        where: { id: existingOfflineMessage.id },
                        data: {
                            sender_username: message.sender.username,
                            content: message.content,
                            emotes: emotesToSave,
                            timestamp: BigInt(message.timestamp),
                            sender_username_color: message.sender.identity?.username_color || null,
                            sender_badges: message.sender.identity?.badges || undefined,
                            sender_is_verified: message.sender.is_verified || false,
                            sender_is_anonymous: message.sender.is_anonymous || false,
                        },
                    })
                } else {
                    try {
                        await db.offlineChatMessage.create({
                            data: {
                                message_id: message.message_id,
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
                            },
                        })
                        isNewMessage = true
                        logDebug(`✅ Saved offline message to database: ${message.message_id}`)
                    } catch (createError: any) {
                        // Handle race condition: another request created the message between our check and create
                        if (createError instanceof Prisma.PrismaClientKnownRequestError) {
                            if (createError.code === 'P2002') {
                                // Message was created by another request, silently continue
                                // No points for offline messages anyway
                            } else if (createError.code === 'P2028') {
                                // Transaction timeout - log but don't fail
                                console.error('Transaction timeout creating offline chat message:', createError)
                            } else {
                                throw createError
                            }
                        } else {
                            throw createError
                        }
                    }
                }
            } else {
                // Use upsert to atomically handle race conditions - prevents duplicate message_id errors
                // First check if message exists to preserve its stream_session_id if already assigned
                const existingMessage = await db.chatMessage.findUnique({
                    where: { message_id: message.message_id },
                    select: { stream_session_id: true },
                })

                // Only update stream_session_id if message doesn't have one yet (preserve existing session assignment)
                const shouldUpdateSessionId = !existingMessage?.stream_session_id && sessionIsActive

                const upsertResult = await db.chatMessage.upsert({
                    where: { message_id: message.message_id },
                    update: {
                        // Only update stream_session_id if it was null (don't reassign messages from previous sessions)
                        ...(shouldUpdateSessionId && { stream_session_id: activeSession!.id }),
                        sender_username: message.sender.username,
                        content: message.content,
                        emotes: emotesToSave,
                        timestamp: BigInt(message.timestamp),
                        sender_username_color: message.sender.identity?.username_color || null,
                        sender_badges: message.sender.identity?.badges || undefined,
                        sender_is_verified: message.sender.is_verified || false,
                        sender_is_anonymous: message.sender.is_anonymous || false,
                        sent_when_offline: false,
                        // Preserve existing points_earned and points_reason on update
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
                        points_earned: 0,
                        sent_when_offline: false,
                    },
                })

                // Check if this was a new message by checking if points_earned is still 0
                // If points_earned is 0, it means this is likely a new message (or points weren't awarded yet)
                const messageAfterUpsert = await db.chatMessage.findUnique({
                    where: { message_id: message.message_id },
                    select: {
                        id: true,
                        points_earned: true,
                        points_reason: true,
                        created_at: true,
                    },
                })

                // If message already has points, it's definitely an existing message
                const wasExistingMessage = messageAfterUpsert && messageAfterUpsert.points_earned > 0

                if (wasExistingMessage) {
                    // Existing message - use existing points
                    pointsEarned = messageAfterUpsert.points_earned ?? 0
                    pointsReason = messageAfterUpsert.points_reason || null
                } else if (messageAfterUpsert && messageAfterUpsert.points_earned === 0 && sessionIsActive && !isBot(senderUsernameLower)) {
                    // Message exists but has no points - check if we should award points
                    // First verify the message still has 0 points (prevent race condition)
                    const messageCheck = await db.chatMessage.findUnique({
                        where: { message_id: message.message_id },
                        select: { points_earned: true },
                    })

                    // Only proceed if points are still 0 (another process hasn't awarded points yet)
                    if (messageCheck && messageCheck.points_earned === 0) {
                        isNewMessage = true

                        // Get recent messages from this user for duplicate detection
                        const recentMessages = await db.chatMessage.findMany({
                            where: {
                                sender_user_id: senderUserId,
                                broadcaster_user_id: broadcasterUserId,
                            },
                            orderBy: { timestamp: 'desc' },
                            take: 10, // Check last 10 messages
                            select: { content: true },
                        })

                        const recentMessageContents = recentMessages.map(msg => msg.content)

                        // Detect bot patterns in message content
                        const botDetection = detectBotMessage(message.content, recentMessageContents)

                        if (botDetection.isBot) {
                            logDebug(`🤖 Bot detected for ${senderUsername}: ${botDetection.reasons.join(', ')} (score: ${botDetection.score})`)
                            // Don't award points or emotes for bot messages
                            pointsEarned = 0
                            pointsReason = 'Bot detected'

                            // Update with bot detection reason
                            await db.chatMessage.update({
                                where: { message_id: message.message_id },
                                data: {
                                    points_earned: 0,
                                    points_reason: pointsReason,
                                },
                            })
                        } else {
                            const pointResult = await awardPoint(
                                senderUserId,
                                activeSession!.id,
                                message.message_id,
                                message.sender.identity?.badges
                            )

                            pointsEarned = pointResult.pointsEarned || 0
                            pointsReason = pointResult.reason || null

                            // Update message with points/reason - use conditional update to prevent overwriting if another process already awarded points
                            try {
                                await db.chatMessage.updateMany({
                                    where: {
                                        message_id: message.message_id,
                                        points_earned: 0, // Only update if still 0
                                    },
                                    data: {
                                        points_earned: pointsEarned,
                                        points_reason: pointsEarned > 0 ? null : pointsReason, // Clear reason when points are awarded
                                    },
                                })
                            } catch (updateError) {
                                // If update fails, fetch current state
                                const currentMessage = await db.chatMessage.findUnique({
                                    where: { message_id: message.message_id },
                                    select: { points_earned: true, points_reason: true },
                                })
                                pointsEarned = currentMessage?.points_earned ?? 0
                                pointsReason = currentMessage?.points_reason || null
                            }

                            if (emotesToSave.length > 0) {
                                try {
                                    await awardEmotes(senderUserId, emotesToSave)
                                } catch (emoteError) {
                                    console.warn('Failed to award emotes (non-critical):', emoteError)
                                }
                            }
                        }
                    } else {
                        // Another process already awarded points - use existing values
                        pointsEarned = messageCheck?.points_earned ?? 0
                        const existingMessage = await db.chatMessage.findUnique({
                            where: { message_id: message.message_id },
                            select: { points_reason: true },
                        })
                        pointsReason = existingMessage?.points_reason || null
                    }
                } else {
                    // Not a new message or conditions not met - use existing points
                    pointsEarned = messageAfterUpsert?.points_earned ?? 0
                    pointsReason = messageAfterUpsert?.points_reason || null
                }

                logDebug(`✅ Saved message to database: ${message.message_id} (points: ${pointsEarned}, isNew: ${isNewMessage})`)
            }

            // Update stream session message count if session exists and is active
            // Only count messages that were sent when online
            if (isNewMessage && sessionIsActive && activeSession) {
                const messageCount = await db.chatMessage.count({
                    where: {
                        stream_session_id: activeSession.id,
                    },
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
            // Only process for NEW messages when stream is active
            if (isNewMessage && !isBot(senderUsernameLower) && sessionIsActive && activeSession) {
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
                                logDebug(`🎁 Updated ${senderUsername} giveaway entry: ${sessionPoints} tickets`)
                            }
                        }
                    }
                } catch (giveawayError) {
                    // Don't fail the entire request if giveaway entry fails
                    console.error('Error processing giveaway auto-entry:', giveawayError)
                }
            }

            const duration = Date.now() - startTime

            // Log when NEW points are earned (not duplicates) or when Kick account is not connected
            if (isNewMessage) {
                if (pointsEarned > 0) {
                    logRequest(`[chat/save] user=${senderUsername} duration=${duration}ms points=${pointsEarned}`)
                } else if (pointsReason === 'Kick account not connected') {
                    logRequest(`[chat/save] user=${senderUsername} duration=${duration}ms points=0 reason="Kick account not connected"`)
                }
            }

            return NextResponse.json({
                success: true,
                message: 'Message saved to database',
                pointsEarned,
                pointsReason
            })
        } catch (error) {
            // For other errors, log them
            console.error('Failed to save chat message:', error)
            throw error
        }
    } catch (error) {
        const duration = Date.now() - startTime

        // Filter out ECONNRESET errors (client disconnects) - not real errors
        const isConnectionReset = error instanceof Error &&
            (('code' in error && (error as any).code === 'ECONNRESET') || error.message.includes('aborted'))

        if (!isConnectionReset) {
            console.error(`/api/chat/save 500 in ${duration}ms - Chat message save failed:`, error)
        }

        return NextResponse.json(
            { error: 'Failed to save message', details: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        )
    }
}
