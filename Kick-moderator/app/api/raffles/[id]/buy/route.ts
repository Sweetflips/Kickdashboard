import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth'
import { purchaseTickets } from '@/lib/raffles'

export const dynamic = 'force-dynamic'

export async function POST(
    request: Request,
    { params }: { params: { id: string } }
) {
    try {
        const auth = await getAuthenticatedUser(request)
        if (!auth) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            )
        }

        const body = await request.json()
        const { quantity } = body

        if (!quantity || quantity <= 0) {
            return NextResponse.json(
                { error: 'Invalid quantity' },
                { status: 400 }
            )
        }

        const raffleId = BigInt(params.id)
        const result = await purchaseTickets(auth.userId, raffleId, parseInt(quantity))

        if (!result.success) {
            return NextResponse.json(
                { error: result.error || 'Failed to purchase tickets' },
                { status: 400 }
            )
        }

        return NextResponse.json({
            success: true,
            tickets_purchased: result.ticketsPurchased,
            new_balance: result.newBalance,
        })
    } catch (error) {
        console.error('Error purchasing tickets:', error)
        return NextResponse.json(
            { error: 'Failed to purchase tickets', details: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        )
    }
}
