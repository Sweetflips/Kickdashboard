import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

// In-memory DB circuit breaker to avoid hammering Postgres when it's unhealthy.
let dbCircuitOpenUntil = 0
let dbCircuitBackoffMs = 1000

function isDbCircuitOpen() {
    return Date.now() < dbCircuitOpenUntil
}

function openDbCircuit() {
    const now = Date.now()
    dbCircuitOpenUntil = now + dbCircuitBackoffMs
    dbCircuitBackoffMs = Math.min(dbCircuitBackoffMs * 2, 30_000)
}

function closeDbCircuit() {
    dbCircuitOpenUntil = 0
    dbCircuitBackoffMs = 1000
}

function isRetryableDbError(error: any) {
    return (
        error?.code === 'P1001' ||
        error?.code === 'P2024' ||
        error?.code === 'P2028' ||
        error?.message?.includes("Can't reach database server") ||
        error?.message?.includes('PrismaClientInitializationError') ||
        error?.message?.includes('connection pool') ||
        error?.message?.includes('Unable to start a transaction')
    )
}

/**
 * Get updated sweet coins for specific messages
 * POST /api/chat/sweet-coins
 * Body: { messageIds: string[] }
 */
export async function POST(request: Request) {
    try {
        // If DB is unhealthy, fail soft to avoid flooding the origin.
        if (isDbCircuitOpen()) {
            return NextResponse.json({
                success: true,
                sweet_coins: {},
                degraded: true,
            })
        }

        let body
        try {
            body = await request.json()
        } catch (parseError) {
            return NextResponse.json(
                { error: 'Invalid JSON in request body' },
                { status: 400 }
            )
        }

        const { messageIds } = body || {}

        if (!Array.isArray(messageIds) || messageIds.length === 0) {
            return NextResponse.json(
                { error: 'messageIds array is required' },
                { status: 400 }
            )
        }

        // Limit to 100 messages per request
        const limitedIds = messageIds.slice(0, 100)

        // Fetch updated sweet coins for these messages with retry logic for connection pool exhaustion
        let messages: { message_id: string; sweet_coins_earned: number; sweet_coins_reason: string | null }[] = []
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                messages = await db.chatMessage.findMany({
                    where: {
                        message_id: { in: limitedIds },
                    },
                    select: {
                        message_id: true,
                        sweet_coins_earned: true,
                        sweet_coins_reason: true,
                    },
                })
                closeDbCircuit()
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
        const sweetCoinsMap = new Map(
            messages.map((msg) => [
                msg.message_id,
                {
                    sweet_coins_earned: msg.sweet_coins_earned,
                    sweet_coins_reason: msg.sweet_coins_reason,
                },
            ])
        )

        return NextResponse.json({
            success: true,
            sweet_coins: Object.fromEntries(sweetCoinsMap),
        })
    } catch (error) {
        // Filter out ECONNRESET errors (client disconnects) - not real errors
        const isConnectionReset = error instanceof Error &&
            (('code' in error && (error as any).code === 'ECONNRESET') || error.message.includes('aborted'))

        if (!isConnectionReset) {
            console.error('[sweet-coins] Error fetching message sweet coins:', error)
            if (error instanceof Error) {
                console.error('[sweet-coins] Error stack:', error.stack)
            }
        }

        if (isRetryableDbError(error)) {
            openDbCircuit()
        }

        // Fail soft: keep chat UI stable during outages.
        return NextResponse.json({
            success: true,
            sweet_coins: {},
            degraded: true,
        })
    }
}
