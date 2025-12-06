import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

/**
 * Get updated points for specific messages
 * POST /api/chat/points
 * Body: { messageIds: string[] }
 */
export async function POST(request: Request) {
    try {
        const body = await request.json()
        const { messageIds } = body

        if (!Array.isArray(messageIds) || messageIds.length === 0) {
            return NextResponse.json(
                { error: 'messageIds array is required' },
                { status: 400 }
            )
        }

        // Limit to 100 messages per request
        const limitedIds = messageIds.slice(0, 100)

        // Fetch updated points for these messages with retry logic for connection pool exhaustion
        let messages: { message_id: string; points_earned: number; points_reason: string | null }[] = []
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                messages = await db.chatMessage.findMany({
                    where: {
                        message_id: { in: limitedIds },
                    },
                    select: {
                        message_id: true,
                        points_earned: true,
                        points_reason: true,
                    },
                })
                break
            } catch (error: any) {
                if ((error?.code === 'P2024' || error?.message?.includes('connection pool')) && attempt < 2) {
                    await new Promise(resolve => setTimeout(resolve, 100 * Math.pow(2, attempt)))
                    continue
                }
                throw error
            }
        }

        // Create a map for quick lookup
        const pointsMap = new Map(
            messages.map((msg) => [
                msg.message_id,
                {
                    points_earned: msg.points_earned,
                    points_reason: msg.points_reason,
                },
            ])
        )

        return NextResponse.json({
            success: true,
            points: Object.fromEntries(pointsMap),
        })
    } catch (error) {
        // Filter out ECONNRESET errors (client disconnects) - not real errors
        const isConnectionReset = error instanceof Error &&
            (('code' in error && (error as any).code === 'ECONNRESET') || error.message.includes('aborted'))

        if (!isConnectionReset) {
            console.error('Error fetching message points:', error)
        }

        return NextResponse.json(
            {
                error: 'Failed to fetch message points',
                details: error instanceof Error ? error.message : 'Unknown error',
            },
            { status: 500 }
        )
    }
}
