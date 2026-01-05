import { getAuthenticatedUser, isAdmin } from '@/lib/auth'
import { db } from '@/lib/db'
import { drawWinners } from '@/lib/raffles'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

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
                number_of_winners: true,
            },
        })

        if (!raffle) {
            return NextResponse.json(
                { error: 'Raffle not found' },
                { status: 404 }
            )
        }

        // Prefer explicit number_of_winners field, otherwise fallback to parsing prize_description
        let bodyCount: number | null = null
        try {
            const bodyData = await request.json()
            if (bodyData && typeof bodyData.count === 'number') bodyCount = bodyData.count
        } catch (err) {
            // no body present
            bodyCount = null
        }

        const numberOfWinners = bodyCount || raffle.number_of_winners || (() => {
            const winnerMatch = raffle.prize_description.match(/(\d+)\s*winner/i)
            return winnerMatch ? parseInt(winnerMatch[1]) : 1
        })()

        const result = await drawWinners(raffleId, numberOfWinners)

        if (!result.success) {
            return NextResponse.json(
                { error: result.error || 'Failed to draw winners' },
                { status: 400 }
            )
        }

        return NextResponse.json({
            success: true,
            total_tickets: result.totalTickets,
            winners: result.winners?.map(w => ({
                entry_id: w.entryId.toString(),
                user_id: w.userId.toString(),
                username: w.username,
                tickets: w.tickets,
                selected_ticket_index: w.selectedTicketIndex,
                ticket_range_start: w.ticketRangeStart,
                ticket_range_end: w.ticketRangeEnd,
                spin_number: w.spinNumber,
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
