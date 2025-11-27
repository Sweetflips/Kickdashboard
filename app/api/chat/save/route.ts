import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { isBot } from '@/lib/points'
import { enqueuePointJob } from '@/lib/point-queue'
import { getActiveGiveaway, isUserEligible } from '@/lib/giveaway'
import { detectBotMessage } from '@/lib/bot-detection'
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

        // Batch user upserts in parallel to reduce connection usage
        // Add retry logic for serialization errors (P4001)
        let senderUser: { id: bigint } | null = null
        let broadcasterUser: { id: bigint } | null = null

        const upsertUserWithRetry = async (userId: bigint, username: string, profilePicture: string | null, maxRetries = 3) => {
            for (let attempt = 0; attempt < maxRetries; attempt++) {
                try {
                    const result = await db.user.upsert({
                        where: { kick_user_id: userId },
                        update: {
                            username: username,
                            profile_picture_url: profilePicture || undefined, // Only update if provided
                        },
                        create: {
                            kick_user_id: userId,
                            username: username,
                            profile_picture_url: profilePicture,
                        },
                        select: {
                            id: true,
                            kick_user_id: true,
                            profile_picture_url: true,
                            bio: true,
                            email: true,
                        },
                    })

                    // Enrich user in background if missing data
                    const needsEnrichment = !result.email || !result.profile_picture_url || !result.bio
                    if (needsEnrichment && Number(result.kick_user_id) > 0) {
                        // Don't await - fetch in background to avoid slowing down chat processing
                        setImmediate(async () => {
                            try {
                                const { getUsersByIds, getUserInfoBySlug } = await import('@/lib/kick-api')

                                // Try Users API first (has email)
                                const usersData = await getUsersByIds([Number(result.kick_user_id)])
                                const userData = usersData.get(Number(result.kick_user_id))

                                if (userData) {
                                    // Update with full user data from Users API
                                    await db.user.update({
                                        where: { kick_user_id: BigInt(result.kick_user_id) },
                                        data: {
                                            username: userData.name,
                                            email: userData.email || undefined,
                                            profile_picture_url: userData.profile_picture || undefined,
                                        },
                                    })
                                } else if (username && username !== 'Unknown') {
                                    // Fallback to channel API for profile picture/bio
                                    const channelInfo = await getUserInfoBySlug(username.toLowerCase())
                                    if (channelInfo) {
                                        await db.user.update({
                                            where: { kick_user_id: BigInt(result.kick_user_id) },
                                            data: {
                                                ...(channelInfo.profile_picture_url && {
                                                    profile_picture_url: channelInfo.profile_picture_url
                                                }),
                                                ...(channelInfo.bio && { bio: channelInfo.bio }),
                                            },
                                        })
                                    }
                                }
                            } catch (error) {
                                // Silently fail - non-critical
                                console.debug(`Failed to enrich user ${result.kick_user_id}:`, error)
                            }
                        })
                    }

                    return result
                } catch (error: any) {
                    // Handle serialization errors (P4001) and deadlocks (P2034) with retry
                    const isSerializationError = error?.code === 'P4001' ||
                                                error?.code === 'P2034' ||
                                                error?.message?.includes('could not serialize access') ||
                                                error?.message?.includes('concurrent update')

                    if (isSerializationError && attempt < maxRetries - 1) {
                        const delay = Math.min(50 * Math.pow(2, attempt), 500) // 50ms, 100ms, 200ms max
                        await new Promise(resolve => setTimeout(resolve, delay))
                        continue
                    }
                    throw error
                }
            }
            throw new Error('Max retries exceeded for user upsert')
        }


        try {
            const [senderResult, broadcasterResult] = await Promise.all([
                upsertUserWithRetry(senderUserId, message.sender.username, message.sender.profile_picture || null),
                upsertUserWithRetry(broadcasterUserId, message.broadcaster.username, message.broadcaster.profile_picture || null),
            ])
            senderUser = senderResult
            broadcasterUser = broadcasterResult
        } catch (error) {
            console.error('Failed to upsert users:', error)
            return NextResponse.json(
                { error: 'Failed to create/update users' },
                { status: 500 }
            )
        }

        // Find active stream session for this broadcaster (only fetch needed fields)
        let activeSession = await db.streamSession.findFirst({
            where: {
                broadcaster_user_id: broadcasterUserId,
                ended_at: null,
            },
            orderBy: { started_at: 'desc' },
            select: {
                id: true,
                ended_at: true,
                thumbnail_url: true,
            },
        })

        // Determine if message was sent when offline
        const sentWhenOffline = !activeSession
        const sessionIsActive = activeSession !== null && activeSession.ended_at === null

        // DISABLED: Thumbnail fetching disabled to prevent connection pool exhaustion
        // This can be handled by a separate worker process
        /*
        if (!activeSession || !activeSession.thumbnail_url) {
            setImmediate(async () => {
                try {
                    const broadcasterSlug = message.broadcaster.channel_slug || message.broadcaster.username.toLowerCase()
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

                        if (activeSession && thumbnailUrl) {
                            // Update existing session thumbnail
                            await db.streamSession.update({
                                where: { id: activeSession!.id },
                                data: { thumbnail_url: thumbnailUrl },
                            })
                            logDebug(`✅ Updated thumbnail for session ${activeSession!.id}`)
                        } else if (!activeSession && isLive) {
                            // Stream is live but no session exists - create one
                            await db.streamSession.create({
                                data: {
                                    broadcaster_user_id: broadcasterUserId,
                                    channel_slug: broadcasterSlug,
                                    session_title: streamTitle || null,
                                    thumbnail_url: thumbnailUrl,
                                    started_at: new Date(),
                                    peak_viewer_count: viewerCount,
                                },
                            })
                            logDebug(`✅ Stream is live but no session existed - created session`)
                        }
                    }
                } catch (error) {
                    // Non-critical - just log and continue
                    logDebug(`⚠️ Could not check/update stream status:`, error)
                }
            })
        }
        */

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
                // Use upsert to atomically handle race conditions - prevents duplicate message_id errors
                // Add retry logic for serialization errors
                const upsertOfflineMessageWithRetry = async (maxRetries = 3) => {
                    for (let attempt = 0; attempt < maxRetries; attempt++) {
                        try {
                            return await db.offlineChatMessage.upsert({
                                where: { message_id: message.message_id },
                                update: {
                                    sender_username: message.sender.username,
                                    content: message.content,
                                    emotes: emotesToSave,
                                    timestamp: BigInt(message.timestamp),
                                    sender_username_color: message.sender.identity?.username_color || null,
                                    sender_badges: message.sender.identity?.badges || undefined,
                                    sender_is_verified: message.sender.is_verified || false,
                                    sender_is_anonymous: message.sender.is_anonymous || false,
                                },
                                create: {
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
                        } catch (error: any) {
                            const isSerializationError = error?.code === 'P4001' ||
                                                        error?.code === 'P2034' ||
                                                        error?.message?.includes('could not serialize access') ||
                                                        error?.message?.includes('concurrent update')

                            if (isSerializationError && attempt < maxRetries - 1) {
                                const delay = Math.min(50 * Math.pow(2, attempt), 500) // 50ms, 100ms, 200ms max
                                await new Promise(resolve => setTimeout(resolve, delay))
                                continue
                            }
                            throw error
                        }
                    }
                    throw new Error('Max retries exceeded for offline message upsert')
                }

                await upsertOfflineMessageWithRetry()
                isNewMessage = true
                logDebug(`✅ Saved offline message to database: ${message.message_id}`)
            } else {
                // Use upsert to atomically handle race conditions - prevents duplicate message_id errors
                // Fetch existing message data in one query to check stream_session_id and points
                const existingMessage = await db.chatMessage.findUnique({
                    where: { message_id: message.message_id },
                    select: {
                        stream_session_id: true,
                        points_earned: true,
                        points_reason: true,
                    },
                })

                // Only update stream_session_id if message doesn't have one yet (preserve existing session assignment)
                const shouldUpdateSessionId = !existingMessage?.stream_session_id && sessionIsActive && activeSession !== null
                const wasExistingMessage = existingMessage !== null && existingMessage.points_earned > 0

                // Upsert message with retry logic for serialization errors
                const upsertMessageWithRetry = async (maxRetries = 3) => {
                    for (let attempt = 0; attempt < maxRetries; attempt++) {
                        try {
                            return await db.chatMessage.upsert({
                                where: { message_id: message.message_id },
                                update: {
                                    // Only update stream_session_id if it was null (don't reassign messages from previous sessions)
                                    ...(shouldUpdateSessionId && activeSession ? { stream_session_id: activeSession.id } : {}),
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
                                    stream_session_id: sessionIsActive && activeSession ? activeSession.id : null,
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
                                select: {
                                    points_earned: true,
                                    points_reason: true,
                                },
                            })
                        } catch (error: any) {
                            // Handle serialization errors (P4001) and deadlocks (P2034) with retry
                            const isSerializationError = error?.code === 'P4001' ||
                                                        error?.code === 'P2034' ||
                                                        error?.message?.includes('could not serialize access') ||
                                                        error?.message?.includes('concurrent update')

                            if (isSerializationError && attempt < maxRetries - 1) {
                                const delay = Math.min(50 * Math.pow(2, attempt), 500) // 50ms, 100ms, 200ms max
                                await new Promise(resolve => setTimeout(resolve, delay))
                                continue
                            }
                            throw error
                        }
                    }
                    throw new Error('Max retries exceeded for message upsert')
                }

                const upsertResult = await upsertMessageWithRetry()

                // If message already has points, it's definitely an existing message
                if (wasExistingMessage) {
                    // Existing message - use existing points
                    pointsEarned = existingMessage.points_earned ?? 0
                    pointsReason = existingMessage.points_reason || null
                } else if (upsertResult.points_earned === 0 && sessionIsActive && !isBot(senderUsernameLower)) {
                    // Message exists but has no points - check if we should award points
                    // Use atomic update to check and set pending status
                    isNewMessage = true

                    // Bot detection disabled temporarily to reduce connection pool pressure
                    // This query can be slow and holds connections unnecessarily
                    // TODO: Re-enable via async worker or make it optional
                    let recentMessageContents: string[] = []
                    const botDetection = detectBotMessage(message.content, recentMessageContents)

                    if (botDetection.isBot) {
                        logDebug(`🤖 Bot detected for ${senderUsername}: ${botDetection.reasons.join(', ')} (score: ${botDetection.score})`)
                        // Don't award points or emotes for bot messages
                        pointsEarned = 0
                        pointsReason = 'Bot detected'

                        // Update with bot detection reason - removed to reduce connection usage
                        // Worker will handle this if needed
                    } else {
                        // Enqueue point award job for async processing
                        if (activeSession) {
                            // Don't await - let it run async to avoid blocking
                            enqueuePointJob({
                                kickUserId: senderUserId,
                                streamSessionId: activeSession.id,
                                messageId: message.message_id,
                                badges: message.sender.identity?.badges,
                                emotes: emotesToSave.length > 0 ? emotesToSave : null,
                            }).catch(() => {
                                // Ignore errors - queue failures shouldn't break message saving
                            })
                        }

                        // Set initial state - worker will update points_earned and points_reason when processing
                        pointsEarned = 0
                        pointsReason = 'pending'

                        // Removed updateMany to reduce connection usage - worker will set pending status
                    }
                } else {
                    // Not a new message or conditions not met - use existing points
                    pointsEarned = upsertResult.points_earned ?? 0
                    pointsReason = upsertResult.points_reason || null
                }

                logDebug(`✅ Saved message to database: ${message.message_id} (points: ${pointsEarned}, isNew: ${isNewMessage})`)
            }

            // DISABLED: Background operations disabled to prevent connection pool exhaustion
            // These operations can be handled by a separate worker process or done periodically
            // Message count updates and giveaway auto-entry are non-critical and can be deferred

            // TODO: Re-enable via worker process or periodic job when connection pool is stable
            // if (isNewMessage && sessionIsActive && activeSession) {
            //     // Update stream session message count
            // }
            // if (isNewMessage && !isBot(senderUsernameLower) && sessionIsActive && activeSession) {
            //     // Auto-entry for active giveaways
            // }

            const duration = Date.now() - startTime

            // Only log when NEW points are earned (not duplicates)
            // The actual point award is logged in lib/points.ts, so we don't need to duplicate here
            // This keeps logs cleaner - only successful point awards are logged

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
