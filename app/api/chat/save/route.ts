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

export async function POST(request: Request) {
    const startTime = Date.now()
    try {
        const body = await request.json()
        const message = body as ChatMessage

        if (!message.message_id || !message.sender || !message.content) {
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
                        console.log(`✅ Stream is live but no session existed - created session ${activeSession.id}`)
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

        // Calculate points earned (only when stream is active)
        const senderUsernameLower = senderUsername.toLowerCase()
        let pointsEarned = 0
        if (!sentWhenOffline && sessionIsActive && !isBot(senderUsernameLower)) {
            const pointResult = await awardPoint(
                senderUserId,
                activeSession!.id,
                message.message_id,
                message.sender.identity?.badges
            )
            pointsEarned = pointResult.pointsEarned || 0
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
        if (emotesToSave.length > 0 && !sentWhenOffline && sessionIsActive && !isBot(senderUsernameLower)) {
            try {
                await awardEmotes(senderUserId, emotesToSave)
            } catch (emoteError) {
                // Don't fail message save if emote award fails
                console.warn('Failed to award emotes (non-critical):', emoteError)
            }
        }

        // Save message to database (use upsert to handle duplicates gracefully)
        // ALWAYS save messages, even when offline or if other operations fail
        try {

            // Log emotes structure for debugging (only occasionally)
            if (emotesToSave.length > 0 && Math.random() < 0.01) {
                console.log('💾 Saving message with emotes:', {
                    message_id: message.message_id,
                    sender: message.sender.username,
                    emotes_count: emotesToSave.length,
                    emotes_structure: emotesToSave[0],
                    has_positions: emotesToSave[0]?.positions?.length > 0,
                })
            }

            if (sentWhenOffline) {
                // Save offline messages to separate table
                await db.offlineChatMessage.upsert({
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
                console.log(`✅ Saved offline message to database: ${message.message_id}`)
            } else {
                // Save online messages to regular table
                const messageData = {
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
                    sent_when_offline: false,
                }

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
                        sent_when_offline: false,
                    },
                    create: messageData,
                })
                console.log(`✅ Saved message to database: ${message.message_id} (points: ${pointsEarned})`)
            }

            // Update stream session message count if session exists and is active
            // Only count messages that were sent when online
            if (sessionIsActive && activeSession) {
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
            // Only process when stream is active
            if (!isBot(senderUsernameLower) && sessionIsActive && activeSession) {
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
                                console.log(`🎁 Updated ${senderUsername} giveaway entry: ${sessionPoints} tickets`)
                            }
                        }
                    }
                } catch (giveawayError) {
                    // Don't fail the entire request if giveaway entry fails
                    console.error('Error processing giveaway auto-entry:', giveawayError)
                }
            }

            const duration = Date.now() - startTime
            const pointsInfo = pointsEarned > 0 ? ` (+${pointsEarned}pts)` : ''
            console.log(`/api/chat/save 200 in ${duration}ms - ${senderUsername}${pointsInfo}`)

            return NextResponse.json({
                success: true,
                message: 'Message saved to database',
                pointsEarned
            })
        } catch (error) {
            // For other errors, log them
            console.error('Failed to save chat message:', error)
            throw error
        }
    } catch (error) {
        const duration = Date.now() - startTime
        console.error(`/api/chat/save 500 in ${duration}ms - Chat message save failed:`, error)
        return NextResponse.json(
            { error: 'Failed to save message', details: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        )
    }
}
