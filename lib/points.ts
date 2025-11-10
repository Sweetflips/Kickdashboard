import { db } from '@/lib/db'

const BOT_USERNAMES = ['botrix', 'kickbot']
const POINTS_PER_MESSAGE_NORMAL = 1
const POINTS_PER_MESSAGE_SUBSCRIBER = 2
const RATE_LIMIT_SECONDS = 300 // 5 minutes
const STREAM_START_COOLDOWN_SECONDS = 600 // 10 minutes

export function isBot(username: string): boolean {
    return BOT_USERNAMES.some(bot => username.toLowerCase() === bot.toLowerCase())
}

export function isSubscriber(badges: Array<{ text: string; type: string; count?: number }> | null | undefined): boolean {
    if (!badges || !Array.isArray(badges)) return false

    // Check for subscriber-related badges
    const subscriberBadgeTypes = ['subscriber', 'sub_gifter', 'founder', 'sub']
    return badges.some(badge =>
        subscriberBadgeTypes.some(type =>
            badge.type?.toLowerCase().includes(type) ||
            badge.text?.toLowerCase().includes('sub')
        )
    )
}

export async function awardPoint(
    kickUserId: bigint,
    streamSessionId: bigint | null,
    messageId: string | null,
    badges?: Array<{ text: string; type: string; count?: number }> | null
): Promise<{ awarded: boolean; pointsEarned?: number; reason?: string }> {
    try {
        // First, find the user by kick_user_id to get the internal id
        const user = await db.user.findUnique({
            where: { kick_user_id: kickUserId },
            select: { id: true },
        })

        if (!user) {
            return {
                awarded: false,
                reason: 'User not found',
            }
        }

        const userId = user.id

        // Get or create user points record
        let userPoints = await db.userPoints.findUnique({
            where: { user_id: userId },
        })

        if (!userPoints) {
            userPoints = await db.userPoints.create({
                data: {
                    user_id: userId,
                    total_points: 0,
                    total_emotes: 0,
                },
            })
        }

        // If no stream session, award 0 points (offline)
        if (!streamSessionId) {
            return {
                awarded: false,
                pointsEarned: 0,
                reason: 'Stream is offline',
            }
        }

        // Verify the session exists and is actually active (not ended)
        // Fetch fresh from database to avoid race conditions
        const session = await db.streamSession.findUnique({
            where: { id: streamSessionId },
            select: {
                ended_at: true,
                broadcaster_user_id: true,
                started_at: true,
            },
        })

        // If session doesn't exist or has ended, don't award points
        if (!session || session.ended_at !== null) {
            console.log(`⏸️ Session ${streamSessionId} is not active - skipping points`)
            return {
                awarded: false,
                pointsEarned: 0,
                reason: 'Stream session has ended',
            }
        }

        // Check if stream has been running for at least 10 minutes
        const now = new Date()
        const timeSinceStreamStart = (now.getTime() - session.started_at.getTime()) / 1000
        if (timeSinceStreamStart < STREAM_START_COOLDOWN_SECONDS) {
            const remainingSeconds = Math.ceil(STREAM_START_COOLDOWN_SECONDS - timeSinceStreamStart)
            const remainingMinutes = Math.floor(remainingSeconds / 60)
            const remainingSecs = remainingSeconds % 60
            return {
                awarded: false,
                pointsEarned: 0,
                reason: `Points unavailable: Stream must be live for 10 minutes (${remainingMinutes}m ${remainingSecs}s remaining)`,
            }
        }

        // Check rate limit
        if (userPoints.last_point_earned_at) {
            const timeSinceLastPoint = (now.getTime() - userPoints.last_point_earned_at.getTime()) / 1000
            if (timeSinceLastPoint < RATE_LIMIT_SECONDS) {
                const remainingSeconds = Math.ceil(RATE_LIMIT_SECONDS - timeSinceLastPoint)
                const remainingMinutes = Math.floor(remainingSeconds / 60)
                const remainingSecs = remainingSeconds % 60
                return {
                    awarded: false,
                    pointsEarned: 0,
                    reason: `Rate limit: ${remainingMinutes}m ${remainingSecs}s remaining`,
                }
            }
        }

        // Determine points based on subscription status
        const isSub = isSubscriber(badges)
        const pointsToAward = isSub ? POINTS_PER_MESSAGE_SUBSCRIBER : POINTS_PER_MESSAGE_NORMAL

        // Award points
        await db.userPoints.update({
            where: { user_id: userId },
            data: {
                total_points: {
                    increment: pointsToAward,
                },
                last_point_earned_at: now,
                updated_at: now,
            },
        })

        // Log to point history
        await db.pointHistory.create({
            data: {
                user_id: userId,
                stream_session_id: streamSessionId,
                points_earned: pointsToAward,
                message_id: messageId,
                earned_at: now,
            },
        })

        return {
            awarded: true,
            pointsEarned: pointsToAward
        }
    } catch (error) {
        console.error('Error awarding point:', error)
        return {
            awarded: false,
            reason: error instanceof Error ? error.message : 'Unknown error',
        }
    }
}

export async function awardEmotes(
    kickUserId: bigint,
    emotes: Array<{ emote_id: string; positions: Array<{ s: number; e: number }> }> | null | undefined
): Promise<{ counted: number }> {
    try {
        if (!emotes || !Array.isArray(emotes) || emotes.length === 0) {
            return { counted: 0 }
        }

        // Count total emote occurrences (sum of all positions)
        const totalEmotes = emotes.reduce((total, emote) => {
            return total + (emote.positions?.length || 0)
        }, 0)

        if (totalEmotes === 0) {
            return { counted: 0 }
        }

        // Find the user by kick_user_id to get the internal id
        const user = await db.user.findUnique({
            where: { kick_user_id: kickUserId },
            select: { id: true },
        })

        if (!user) {
            return { counted: 0 }
        }

        const userId = user.id

        // Get or create user points record
        let userPoints = await db.userPoints.findUnique({
            where: { user_id: userId },
        })

        if (!userPoints) {
            userPoints = await db.userPoints.create({
                data: {
                    user_id: userId,
                    total_points: 0,
                    total_emotes: 0,
                },
            })
        }

        // Update emote count
        await db.userPoints.update({
            where: { user_id: userId },
            data: {
                total_emotes: {
                    increment: totalEmotes,
                },
                updated_at: new Date(),
            },
        })

        console.log(`✅ Awarded ${totalEmotes} emote(s) to user ${kickUserId} (total_emotes incremented)`)

        return { counted: totalEmotes }
    } catch (error) {
        console.error('Error awarding emotes:', error)
        return { counted: 0 }
    }
}

export async function getUserPoints(kickUserId: bigint): Promise<number> {
    try {
        const user = await db.user.findUnique({
            where: { kick_user_id: kickUserId },
            select: { id: true },
        })

        if (!user) {
            return 0
        }

        const userPoints = await db.userPoints.findUnique({
            where: { user_id: user.id },
        })
        return userPoints?.total_points || 0
    } catch (error) {
        console.error('Error getting user points:', error)
        return 0
    }
}
