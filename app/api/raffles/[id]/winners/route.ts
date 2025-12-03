import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAuthenticatedUser } from '@/lib/auth'

export async function GET(
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

        const raffleId = BigInt(params.id)

        // Get raffle with winners
        const raffle = await db.raffle.findUnique({
            where: { id: raffleId },
            select: {
                id: true,
                title: true,
                status: true,
                drawn_at: true,
                draw_seed: true,
                winners: {
                    select: {
                        id: true,
                        selected_at: true,
                        entry: {
                            select: {
                                tickets: true,
                                user: {
                                    select: {
                                        id: true,
                                        username: true,
                                        profile_picture_url: true,
                                    },
                                },
                            },
                        },
                    },
                    orderBy: {
                        selected_at: 'asc',
                    },
                },
            },
        })

        if (!raffle) {
            return NextResponse.json(
                { error: 'Raffle not found' },
                { status: 404 }
            )
        }

        // Format winners for response
        const winners = raffle.winners.map((winner) => ({
            id: winner.id.toString(),
            username: winner.entry.user.username,
            user_id: winner.entry.user.id.toString(),
            profile_picture: winner.entry.user.profile_picture_url,
            tickets: winner.entry.tickets,
            selected_at: winner.selected_at.toISOString(),
        }))

        return NextResponse.json({
            raffle_id: raffle.id.toString(),
            title: raffle.title,
            status: raffle.status,
            drawn_at: raffle.drawn_at?.toISOString() || null,
            winners,
        })
    } catch (error) {
        console.error('Error fetching winners:', error)
        return NextResponse.json(
            { error: 'Failed to fetch winners', details: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        )
    }
}

