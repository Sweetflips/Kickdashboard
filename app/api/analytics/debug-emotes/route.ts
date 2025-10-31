import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(request: Request) {
    try {
        // Get a sample of messages with their emotes data
        const messages = await db.chatMessage.findMany({
            take: 20,
            select: {
                message_id: true,
                content: true,
                emotes: true,
                sender_username: true,
                created_at: true,
            },
            orderBy: {
                created_at: 'desc',
            },
        })

        // Analyze emotes structure
        const analysis = messages.map((msg) => {
            const emotes = msg.emotes
            const analysis: any = {
                message_id: msg.message_id,
                sender: msg.sender_username,
                content_preview: msg.content.substring(0, 50),
                emotes_type: typeof emotes,
                emotes_is_null: emotes === null,
                emotes_is_undefined: emotes === undefined,
                emotes_is_array: Array.isArray(emotes),
                emotes_length: Array.isArray(emotes) ? emotes.length : null,
                emotes_raw: emotes,
            }

            if (Array.isArray(emotes) && emotes.length > 0) {
                analysis.first_emote_structure = emotes[0]
                analysis.has_positions = emotes.some((e: any) =>
                    e && typeof e === 'object' &&
                    ((Array.isArray(e.positions) && e.positions.length > 0) ||
                     (Array.isArray(e.position) && e.position.length > 0))
                )
            }

            return analysis
        })

        // Get overall stats
        const totalMessages = await db.chatMessage.count()

        // Count messages with empty array emotes (we'll count nulls in the loop)
        const messagesWithEmptyArrayEmotes = await db.chatMessage.findMany({
            select: {
                emotes: true,
            },
        })

        let messagesWithNullEmotes = 0
        let messagesWithEmptyArray = 0
        let messagesWithValidEmotes = 0

        for (const msg of messagesWithEmptyArrayEmotes) {
            if (msg.emotes === null) {
                messagesWithNullEmotes++
                continue
            }

            let emotesData: any = msg.emotes
            if (typeof emotesData === 'string') {
                try {
                    emotesData = JSON.parse(emotesData)
                } catch {
                    emotesData = null
                }
            }

            if (Array.isArray(emotesData)) {
                if (emotesData.length === 0) {
                    messagesWithEmptyArray++
                } else {
                    // Check if it has valid emotes with positions
                    const hasValidEmotes = emotesData.some((emote: any) => {
                        return emote && typeof emote === 'object' &&
                               ((Array.isArray(emote.positions) && emote.positions.length > 0) ||
                                (Array.isArray(emote.position) && emote.position.length > 0))
                    })
                    if (hasValidEmotes) {
                        messagesWithValidEmotes++
                    } else {
                        messagesWithEmptyArray++
                    }
                }
            }
        }

        return NextResponse.json({
            sample_messages: analysis,
            statistics: {
                total_messages: totalMessages,
                messages_with_null_emotes: messagesWithNullEmotes,
                messages_with_empty_array_emotes: messagesWithEmptyArray,
                messages_with_valid_emotes: messagesWithValidEmotes,
                messages_with_emotes_percentage: totalMessages > 0
                    ? ((messagesWithValidEmotes / totalMessages) * 100).toFixed(2)
                    : 0,
            },
        })
    } catch (error) {
        console.error('Error debugging emotes:', error)
        return NextResponse.json(
            { error: 'Failed to debug emotes', details: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        )
    }
}
