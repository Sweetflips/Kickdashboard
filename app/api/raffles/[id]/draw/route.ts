import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAuthenticatedUser, isAdmin } from '@/lib/auth'
import { drawWinners } from '@/lib/raffles'

export async function POST(
    request: Request,
    { params }: { params: { id: string } }
) {
    try {
        // Check admin access
        const adminCheck = await isAdmin(request)
        if (!adminCheck) {
            return NextResponse.json(
                { error: 'Unauthorized - Admin access required' },
                { status: 403 }
            )
        }

        const auth = await getAuthenticatedUser(request)
        if (!auth) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            )
        }

        const raffleId = BigInt(params.id)

        // Get raffle to determine number of winners
        const raffle = await db.raffle.findUnique({
            where: { id: raffleId },
            select: {
                id: true,
                status: true,
                prize_description: true,
            },
        })

        if (!raffle) {
            return NextResponse.json(
                { error: 'Raffle not found' },
                { status: 404 }
            )
        }

        // Parse number of winners from prize description (e.g., "5 winners – $10 each")
        // Default to 1 if can't parse
        const winnerMatch = raffle.prize_description.match(/(\d+)\s*winner/i)
        const numberOfWinners = winnerMatch ? parseInt(winnerMatch[1]) : 1

        const result = await drawWinners(raffleId, numberOfWinners)

        if (!result.success) {
            return NextResponse.json(
                { error: result.error || 'Failed to draw winners' },
                { status: 400 }
            )
        }

        return NextResponse.json({
            success: true,
            winners: result.winners?.map(w => ({
                entry_id: w.entryId.toString(),
                user_id: w.userId.toString(),
                username: w.username,
                tickets: w.tickets,
            })),
            draw_seed: result.drawSeed,
        })
    } catch (error) {
        console.error('Error drawing winners:', error)
        return NextResponse.json(
            { error: 'Failed to draw winners', details: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        )
    }
}
