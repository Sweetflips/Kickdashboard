import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { isAdmin } from '@/lib/auth'

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

// Helper function to check if message has emotes (from emotes field or content)
function hasEmotes(emotesData: any, content: string): boolean {
    // First check emotes field
    if (emotesData !== null && emotesData !== undefined) {
        if (typeof emotesData === 'string') {
            try {
                emotesData = JSON.parse(emotesData)
            } catch {
                emotesData = null
            }
        }

        if (Array.isArray(emotesData) && emotesData.length > 0) {
            const hasValidEmotes = emotesData.some((emote: any) => {
                return emote && typeof emote === 'object' &&
                       ((Array.isArray(emote.positions) && emote.positions.length > 0) ||
                        (Array.isArray(emote.position) && emote.position.length > 0))
            })
            if (hasValidEmotes) return true
        }
    }

    // Check content for [emote:ID:Name] format
    if (content) {
        const extractedEmotes = extractEmotesFromContent(content)
        if (extractedEmotes.length > 0) return true
    }

    return false
}

// Helper function to analyze message content and categorize engagement type
function analyzeEngagementType(content: string, hasEmotes: boolean): string {
    const text = content.trim().toLowerCase()
    const length = text.length

    // Check for commands
    if (text.startsWith('!')) {
        return 'command'
    }

    // Check for questions
    if (text.includes('?') || text.startsWith('what') || text.startsWith('why') || text.startsWith('how') || text.startsWith('when') || text.startsWith('where') || text.startsWith('who')) {
        return 'question'
    }

    // Very short messages (reactions)
    if (length <= 5 && hasEmotes) {
        return 'reaction'
    }

    if (length <= 10 && !hasEmotes) {
        return 'short_message'
    }

    // Check for exclamations (enthusiasm)
    const exclamationCount = (content.match(/!/g) || []).length
    if (exclamationCount >= 2) {
        return 'enthusiastic'
    }

    // Long messages (conversations)
    if (length > 100) {
        return 'conversation'
    }

    // Medium messages with multiple sentences
    const sentenceCount = (content.match(/[.!?]+/g) || []).length
    if (sentenceCount >= 2) {
        return 'discussion'
    }

    // Emote-only messages
    if (hasEmotes && length <= 20) {
        return 'emote_response'
    }

    // Default to regular message
    return 'regular'
}

export async function GET(request: Request) {
    try {
        // Check admin access - analytics are admin-only
        const adminCheck = await isAdmin(request)
        if (!adminCheck) {
            return NextResponse.json(
                { error: 'Unauthorized - Admin access required' },
                { status: 403 }
            )
        }

        const { searchParams } = new URL(request.url)
        const sessionId = searchParams.get('session_id')

        if (!sessionId) {
            return NextResponse.json(
                { error: 'session_id is required' },
                { status: 400 }
            )
        }

        const sessionIdBigInt = BigInt(sessionId)

        // Get stream session info
        const streamSession = await db.streamSession.findUnique({
            where: { id: sessionIdBigInt },
            select: {
                id: true,
                session_title: true,
                started_at: true,
                ended_at: true,
                peak_viewer_count: true,
            },
        })

        if (!streamSession) {
            return NextResponse.json(
                { error: 'Stream session not found' },
                { status: 404 }
            )
        }

        // Get all messages for this stream
        // Filter out offline messages, invalid user IDs, and messages created before session started
        const allMessages = await db.chatMessage.findMany({
            where: {
                stream_session_id: sessionIdBigInt,
                sent_when_offline: false,
                sender_user_id: {
                    gt: BigInt(0), // Exclude invalid/anonymous user IDs (0 or negative)
                },
                created_at: {
                    gte: streamSession.started_at, // Only count messages created after session started
                },
            },
            select: {
                content: true,
                emotes: true,
                sender_user_id: true,
                sender_username: true,
                created_at: true,
            },
        })

        const totalMessages = allMessages.length

        // Get messages with emotes count
        let messagesWithEmotesCount = 0
        for (const msg of allMessages) {
            if (hasEmotes(msg.emotes, msg.content)) {
                messagesWithEmotesCount++
            }
        }

        // Get unique users - filter out invalid user IDs and messages before session started
        const uniqueUsers = await db.chatMessage.groupBy({
            by: ['sender_user_id'],
            where: {
                stream_session_id: sessionIdBigInt,
                sent_when_offline: false,
                sender_user_id: {
                    gt: BigInt(0), // Exclude invalid/anonymous user IDs (0 or negative)
                },
                created_at: {
                    gte: streamSession.started_at, // Only count messages created after session started
                },
            },
        })

        const totalUsers = uniqueUsers.length

        // Get total points for this stream
        const totalPoints = await db.pointHistory.aggregate({
            where: {
                stream_session_id: sessionIdBigInt,
            },
            _sum: {
                points_earned: true,
            },
        })

        // Get engagement breakdown
        const engagementTypes: Record<string, number> = {
            command: 0,
            question: 0,
            reaction: 0,
            short_message: 0,
            enthusiastic: 0,
            conversation: 0,
            discussion: 0,
            emote_response: 0,
            regular: 0,
        }

        let totalLength = 0
        for (const msg of allMessages) {
            const msgHasEmotes = hasEmotes(msg.emotes, msg.content)
            const type = analyzeEngagementType(msg.content, msgHasEmotes)
            engagementTypes[type] = (engagementTypes[type] || 0) + 1
            totalLength += msg.content.length
        }

        const avgMessageLength = totalMessages > 0 ? (totalLength / totalMessages).toFixed(1) : '0'

        // Get user activity breakdown for this stream
        const userActivityMap = new Map<string, {
            username: string
            messages: number
            emotes: number
            points: number
            engagement_types: Record<string, number>
        }>()

        for (const msg of allMessages) {
            const userId = msg.sender_user_id.toString()
            const userStats = userActivityMap.get(userId) || {
                username: msg.sender_username,
                messages: 0,
                emotes: 0,
                points: 0,
                engagement_types: {
                    command: 0,
                    question: 0,
                    reaction: 0,
                    short_message: 0,
                    enthusiastic: 0,
                    conversation: 0,
                    discussion: 0,
                    emote_response: 0,
                    regular: 0,
                },
            }

            userStats.messages++

            const msgHasEmotes = hasEmotes(msg.emotes, msg.content)
            if (msgHasEmotes) {
                userStats.emotes++
            }

            const type = analyzeEngagementType(msg.content, msgHasEmotes)
            userStats.engagement_types[type] = (userStats.engagement_types[type] || 0) + 1

            userActivityMap.set(userId, userStats)
        }

        // Get points for each user in this stream
        const pointHistory = await db.pointHistory.findMany({
            where: {
                stream_session_id: sessionIdBigInt,
            },
            select: {
                user_id: true,
                points_earned: true,
            },
        })

        for (const ph of pointHistory) {
            const userId = ph.user_id.toString()
            const userStats = userActivityMap.get(userId)
            if (userStats) {
                userStats.points += ph.points_earned
            }
        }

        // Convert to array and sort by activity score
        const userActivity = Array.from(userActivityMap.values()).map((user) => {
            const activityScore = (user.points * 2) + (user.messages * 1) + (user.emotes * 0.5)
            return {
                ...user,
                activity_score: Math.round(activityScore),
            }
        }).sort((a, b) => b.activity_score - a.activity_score)

        // Calculate messages per user
        const avgMessagesPerUser = totalUsers > 0 ? (totalMessages / totalUsers).toFixed(2) : '0'

        // Calculate engagement rate (messages per viewer)
        const engagementRate = streamSession.peak_viewer_count > 0
            ? (totalMessages / streamSession.peak_viewer_count).toFixed(2)
            : '0'

        return NextResponse.json({
            session: {
                id: streamSession.id.toString(),
                title: streamSession.session_title || 'Untitled Stream',
                started_at: streamSession.started_at.toISOString(),
                ended_at: streamSession.ended_at?.toISOString() || null,
                peak_viewer_count: streamSession.peak_viewer_count,
            },
            stats: {
                total_messages: totalMessages,
                messages_with_emotes: messagesWithEmotesCount,
                messages_with_text_only: totalMessages - messagesWithEmotesCount,
                total_points: totalPoints._sum.points_earned || 0,
                unique_users: totalUsers,
                avg_messages_per_user: parseFloat(avgMessagesPerUser),
                engagement_rate: parseFloat(engagementRate),
                avg_message_length: parseFloat(avgMessageLength),
            },
            engagement_types: engagementTypes,
            top_users: userActivity, // All users, not just top 10
        })
    } catch (error) {
        console.error('Error fetching stream analytics:', error)
        return NextResponse.json(
            { error: 'Failed to fetch stream analytics', details: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        )
    }
}
