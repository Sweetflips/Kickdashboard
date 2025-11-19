// Script to backfill emote counts from existing chat messages
require('dotenv').config({ path: '.env.local' })
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function backfillEmotes() {
    try {
        console.log('🔄 Starting emote backfill...')

        // Get ALL messages to check for emotes properly
        const allMessages = await prisma.chatMessage.findMany({
            select: {
                sender_user_id: true, // This is kick_user_id
                emotes: true,
            },
        })

        console.log(`📊 Checking ${allMessages.length} total messages for emotes`)

        // Create a map of kick_user_id to emote count
        const emoteCounts = new Map()
        let messagesWithValidEmotes = 0
        let messagesWithInvalidEmotes = 0
        let messagesWithNullEmotes = 0
        let messagesWithEmptyArray = 0

        // Helper function to extract emotes from content [emote:ID:Name] format
        function extractEmotesFromContent(content) {
            const emotePattern = /\[emote:(\d+):([^\]]+)\]/g
            const emotesMap = new Map()

            let match
            while ((match = emotePattern.exec(content)) !== null) {
                const emoteId = match[1]
                const start = match.index
                const end = start + match[0].length - 1

                if (!emotesMap.has(emoteId)) {
                    emotesMap.set(emoteId, [])
                }
                emotesMap.get(emoteId).push({ s: start, e: end })
            }

            // Convert map to array format
            return Array.from(emotesMap.entries()).map(([emote_id, positions]) => ({
                emote_id,
                positions,
            }))
        }

        // Get all messages with content to check for emotes in content
        const allMessagesWithContent = await prisma.chatMessage.findMany({
            select: {
                sender_user_id: true,
                emotes: true,
                content: true,
            },
        })

        for (const msg of allMessagesWithContent) {
            let emotesData = msg.emotes
            let emoteCount = 0

            // First check if emotes are stored in the emotes field
            if (emotesData !== null && emotesData !== undefined) {
                // Handle JSON parsing if needed
                if (typeof emotesData === 'string') {
                    try {
                        emotesData = JSON.parse(emotesData)
                    } catch {
                        emotesData = null
                    }
                }

                // Check if it's an array with items
                if (Array.isArray(emotesData) && emotesData.length > 0) {
                    // Count emotes - verify at least one has valid positions
                    const hasValidEmotes = emotesData.some((emote) => {
                        return emote && typeof emote === 'object' &&
                               ((Array.isArray(emote.positions) && emote.positions.length > 0) ||
                                (Array.isArray(emote.position) && emote.position.length > 0))
                    })

                    if (hasValidEmotes) {
                        messagesWithValidEmotes++

                        // Count total emotes from positions
                        emoteCount = emotesData.reduce((total, emote) => {
                            if (emote && typeof emote === 'object') {
                                if (emote.positions && Array.isArray(emote.positions)) {
                                    return total + emote.positions.length
                                }
                                if (emote.position && Array.isArray(emote.position)) {
                                    return total + emote.position.length
                                }
                            }
                            return total
                        }, 0)
                    }
                }
            }

            // If no emotes found in emotes field, check content for [emote:ID:Name] format
            if (emoteCount === 0 && msg.content) {
                const extractedEmotes = extractEmotesFromContent(msg.content)
                if (extractedEmotes.length > 0) {
                    if (emoteCount === 0) {
                        messagesWithValidEmotes++
                    }
                    // Count total emotes from positions
                    emoteCount = extractedEmotes.reduce((total, emote) => {
                        return total + (emote.positions?.length || 0)
                    }, 0)
                }
            }

            // Track statistics
            if (emotesData === null) {
                messagesWithNullEmotes++
            } else if (Array.isArray(emotesData) && emotesData.length === 0) {
                messagesWithEmptyArray++
            } else if (emoteCount === 0 && (!emotesData || (Array.isArray(emotesData) && emotesData.length === 0))) {
                messagesWithInvalidEmotes++
            }

            if (emoteCount > 0) {
                const current = emoteCounts.get(msg.sender_user_id.toString()) || 0
                emoteCounts.set(msg.sender_user_id.toString(), current + emoteCount)
            }
        }

        console.log(`\n📊 Emote Analysis:`)
        console.log(`   Messages with valid emotes: ${messagesWithValidEmotes}`)
        console.log(`   Messages with null emotes: ${messagesWithNullEmotes}`)
        console.log(`   Messages with empty array: ${messagesWithEmptyArray}`)
        console.log(`   Messages with invalid emotes: ${messagesWithInvalidEmotes}`)
        console.log(`   Unique users with emotes: ${emoteCounts.size}`)

        console.log(`📊 Found ${emoteCounts.size} unique users with emotes`)

        // Update user_points for each user
        let updated = 0
        for (const [kickUserIdStr, totalEmotes] of emoteCounts.entries()) {
            const kickUserId = BigInt(kickUserIdStr)

            // Find user by kick_user_id
            const user = await prisma.user.findUnique({
                where: { kick_user_id: kickUserId },
                select: { id: true },
            })

            if (!user) {
                console.log(`⚠️ User not found for kick_user_id: ${kickUserIdStr}`)
                continue
            }

            // Get or create user_points (use upsert to handle race conditions)
            await prisma.userPoints.upsert({
                where: { user_id: user.id },
                update: {
                    total_emotes: totalEmotes,
                    updated_at: new Date(),
                },
                create: {
                    user_id: user.id,
                    total_points: 0,
                    total_emotes: totalEmotes,
                },
            })

            updated++
            if (updated % 10 === 0) {
                console.log(`✅ Updated ${updated} users...`)
            }
        }

        console.log(`✅ Backfill complete! Updated ${updated} users`)
    } catch (error) {
        console.error('❌ Error during backfill:', error)
    } finally {
        await prisma.$disconnect()
    }
}

backfillEmotes()
