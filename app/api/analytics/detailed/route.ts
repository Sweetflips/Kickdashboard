import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { isAdmin } from '@/lib/auth'

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

// Helper function to get engagement breakdown for a user
async function getUserEngagementBreakdown(kickUserId: bigint) {
    const userMessages = await db.chatMessage.findMany({
        where: {
            sender_user_id: kickUserId,
        },
        select: {
            content: true,
            emotes: true,
        },
    })

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
    let longestMessage = 0

    for (const msg of userMessages) {
        const msgHasEmotes = hasEmotes(msg.emotes, msg.content)

        const type = analyzeEngagementType(msg.content, msgHasEmotes)
        engagementTypes[type] = (engagementTypes[type] || 0) + 1

        const msgLength = msg.content.length
        totalLength += msgLength
        if (msgLength > longestMessage) {
            longestMessage = msgLength
        }
    }

    const avgLength = userMessages.length > 0 ? (totalLength / userMessages.length).toFixed(1) : '0'

    return {
        engagement_types: engagementTypes,
        avg_message_length: parseFloat(avgLength),
        longest_message: longestMessage,
        total_messages_analyzed: userMessages.length,
    }
}

export async function GET(request: Request) {
    try {
        // Check admin access
        const adminCheck = await isAdmin(request)
        if (!adminCheck) {
            return NextResponse.json(
                { error: 'Unauthorized - Admin access required' },
                { status: 403 }
            )
        }

        const { searchParams } = new URL(request.url)
        const limit = parseInt(searchParams.get('limit') || '50')
        const offset = parseInt(searchParams.get('offset') || '0')

        // Get top users by points
        const topUsers = await db.userPoints.findMany({
            orderBy: { total_points: 'desc' },
            take: limit,
            skip: offset,
            include: {
                user: {
                    select: {
                        kick_user_id: true,
                        username: true,
                        profile_picture_url: true,
                        custom_profile_picture_url: true,
                    },
                },
            },
        })

        // Get detailed stats for each user
        const detailedUsers = await Promise.all(
            topUsers.map(async (entry, index) => {
                const kickUserId = entry.user.kick_user_id

                // Get total messages sent
                const totalMessages = await db.chatMessage.count({
                    where: {
                        sender_user_id: kickUserId,
                    },
                })

                // Get messages with emotes - check both emotes field and content
                const userMessagesForEmoteCheck = await db.chatMessage.findMany({
                    where: {
                        sender_user_id: kickUserId,
                    },
                    select: {
                        emotes: true,
                        content: true,
                    },
                })

                let messagesWithEmotes = 0
                for (const msg of userMessagesForEmoteCheck) {
                    if (hasEmotes(msg.emotes, msg.content)) {
                        messagesWithEmotes++
                    }
                }

                // Get total emotes sent (sum from all messages) - reuse the same query
                let totalEmotesCounted = 0
                for (const msg of userMessagesForEmoteCheck) {
                    if (hasEmotes(msg.emotes, msg.content)) {
                        // Count emotes from emotes field
                        if (msg.emotes && Array.isArray(msg.emotes)) {
                            const emoteCount = msg.emotes.reduce((total: number, emote: any) => {
                                if (emote?.positions && Array.isArray(emote.positions)) {
                                    return total + emote.positions.length
                                }
                                if (emote?.position && Array.isArray(emote.position)) {
                                    return total + emote.position.length
                                }
                                return total
                            }, 0)
                            totalEmotesCounted += emoteCount
                        } else {
                            // Count emotes from content [emote:ID:Name] format
                            const emotePattern = /\[emote:\d+:[^\]]+\]/g
                            const matches = msg.content.match(emotePattern)
                            if (matches) {
                                totalEmotesCounted += matches.length
                            }
                        }
                    }
                }

                // Get unique stream sessions watched
                const streamsWatchedResult = await db.chatMessage.groupBy({
                    by: ['stream_session_id'],
                    where: {
                        sender_user_id: kickUserId,
                        stream_session_id: { not: null },
                    },
                })

                const streamsWatched = streamsWatchedResult.length

                // Get total points earned
                const totalPoints = entry.total_points || 0

                // Get average points per stream
                const avgPointsPerStream = streamsWatched > 0 ? (totalPoints / streamsWatched).toFixed(2) : '0'

                // Get average messages per stream
                const avgMessagesPerStream = streamsWatched > 0 ? (totalMessages / streamsWatched).toFixed(2) : '0'

                // Get engagement breakdown
                const engagementBreakdown = await getUserEngagementBreakdown(kickUserId)

                // Get activity breakdown
                const activityBreakdown = {
                    messages: totalMessages,
                    emotes: totalEmotesCounted,
                    messages_with_emotes: messagesWithEmotes,
                    points: totalPoints,
                    streams_watched: streamsWatched,
                    avg_points_per_stream: parseFloat(avgPointsPerStream),
                    avg_messages_per_stream: parseFloat(avgMessagesPerStream),
                }

                // Calculate activity score (weighted combination)
                const activityScore =
                    (totalPoints * 2) + // Points weighted higher
                    (totalMessages * 1) +
                    (totalEmotesCounted * 0.5) +
                    (streamsWatched * 10) // Engagement indicator

                return {
                    rank: offset + index + 1,
                    user_id: entry.user_id.toString(),
                    kick_user_id: kickUserId.toString(),
                    username: entry.user.username,
                    profile_picture_url: entry.user.custom_profile_picture_url || entry.user.profile_picture_url,
                    total_points: totalPoints,
                    total_emotes: entry.total_emotes || 0,
                    activity_breakdown: activityBreakdown,
                    engagement_breakdown: engagementBreakdown,
                    activity_score: Math.round(activityScore),
                    last_point_earned_at: entry.last_point_earned_at?.toISOString() || null,
                }
            })
        )

        // Sort by activity score (best viewers)
        detailedUsers.sort((a, b) => b.activity_score - a.activity_score)
        detailedUsers.forEach((user, index) => {
            user.rank = offset + index + 1
        })

        // Get overall stats
        const totalUsers = await db.userPoints.count()
        const totalMessages = await db.chatMessage.count()
        const totalPoints = await db.userPoints.aggregate({
            _sum: { total_points: true },
        })

        // Get messages with emotes count - check both emotes field and content
        const allMessagesForEmoteCheck = await db.chatMessage.findMany({
            select: {
                emotes: true,
                content: true,
            },
        })

        let messagesWithEmotesCount = 0
        for (const msg of allMessagesForEmoteCheck) {
            if (hasEmotes(msg.emotes, msg.content)) {
                messagesWithEmotesCount++
            }
        }

        // Get activity type breakdown
        const activityTypes = {
            messages: totalMessages,
            messages_with_emotes: messagesWithEmotesCount,
            messages_with_text_only: totalMessages - messagesWithEmotesCount,
            emotes: await db.userPoints.aggregate({
                _sum: { total_emotes: true },
            }).then(result => result._sum.total_emotes || 0),
        }

        // Get overall engagement breakdown
        const allMessages = await db.chatMessage.findMany({
            select: {
                content: true,
                emotes: true,
            },
        })

        const overallEngagementTypes: Record<string, number> = {
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
            overallEngagementTypes[type] = (overallEngagementTypes[type] || 0) + 1
            totalLength += msg.content.length
        }

        const avgMessageLength = allMessages.length > 0 ? (totalLength / allMessages.length).toFixed(1) : '0'

        // Get time-based activity (last 30 days)
        const thirtyDaysAgo = new Date()
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

        const dailyMessages = await db.chatMessage.findMany({
            where: {
                created_at: {
                    gte: thirtyDaysAgo,
                },
            },
            select: {
                created_at: true,
                emotes: true,
                content: true,
            },
            orderBy: {
                created_at: 'asc',
            },
        })

        // Group messages by day
        const dailyActivity: Record<string, { messages: number; emotes: number; date: string }> = {}
        for (const msg of dailyMessages) {
            const dateKey = msg.created_at.toISOString().split('T')[0]
            if (!dailyActivity[dateKey]) {
                dailyActivity[dateKey] = { messages: 0, emotes: 0, date: dateKey }
            }
            dailyActivity[dateKey].messages++

            // Check for emotes in both emotes field and content
            if (hasEmotes(msg.emotes, msg.content)) {
                dailyActivity[dateKey].emotes++
            }
        }

        const dailyActivityArray = Object.values(dailyActivity).sort((a, b) =>
            new Date(a.date).getTime() - new Date(b.date).getTime()
        )

        // Get stream performance metrics
        const streams = await db.streamSession.findMany({
            where: {
                ended_at: { not: null },
            },
            select: {
                started_at: true,
                ended_at: true,
                total_messages: true,
                peak_viewer_count: true,
                session_title: true,
            },
            orderBy: {
                started_at: 'desc',
            },
            take: 100,
        })

        const avgMessagesPerStream = streams.length > 0
            ? streams.reduce((sum, s) => sum + s.total_messages, 0) / streams.length
            : 0

        const avgViewersPerStream = streams.length > 0
            ? streams.reduce((sum, s) => sum + s.peak_viewer_count, 0) / streams.length
            : 0

        // Calculate engagement rate (messages per viewer) - not a percentage
        const totalViewers = streams.reduce((sum, s) => sum + s.peak_viewer_count, 0)
        const engagementRate = totalViewers > 0
            ? (totalMessages / totalViewers).toFixed(2)
            : '0'

        // Calculate messages per user
        const avgMessagesPerUser = totalUsers > 0
            ? (totalMessages / totalUsers).toFixed(2)
            : '0'

        // Get top streams by messages
        const topStreams = streams
            .sort((a, b) => b.total_messages - a.total_messages)
            .slice(0, 5)
            .map((s, idx) => ({
                rank: idx + 1,
                messages: s.total_messages,
                viewers: s.peak_viewer_count,
                date: s.started_at.toISOString().split('T')[0],
                title: s.session_title || 'Untitled Stream',
            }))

        return NextResponse.json({
            users: detailedUsers,
            total_users: totalUsers,
            overall_stats: {
                total_messages: totalMessages,
                total_points: totalPoints._sum.total_points || 0,
                activity_types: activityTypes,
                engagement_types: overallEngagementTypes,
                avg_message_length: parseFloat(avgMessageLength),
                daily_activity: dailyActivityArray,
                performance_metrics: {
                    avg_messages_per_stream: parseFloat(avgMessagesPerStream.toFixed(2)),
                    avg_viewers_per_stream: parseFloat(avgViewersPerStream.toFixed(2)),
                    engagement_rate: parseFloat(engagementRate),
                    avg_messages_per_user: parseFloat(avgMessagesPerUser),
                    total_streams_analyzed: streams.length,
                },
                top_streams: topStreams,
            },
            limit,
            offset,
        })
    } catch (error) {
        console.error('Error fetching detailed analytics:', error)
        return NextResponse.json(
            { error: 'Failed to fetch detailed analytics', details: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        )
    }
}
