import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAuthenticatedUser } from '@/lib/auth'

export async function GET(request: Request) {
    try {
        const auth = await getAuthenticatedUser(request)
        if (!auth) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            )
        }

        const entries = await db.raffleEntry.findMany({
            where: {
                user_id: auth.userId,
            },
            include: {
                raffle: {
                    include: {
                        winners: {
                            include: {
                                entry: {
                                    select: {
                                        id: true,
                                    },
                                },
                            },
                        },
                        _count: {
                            select: {
                                entries: true,
                            },
                        },
                    },
                },
            },
            orderBy: {
                created_at: 'desc',
            },
        })

        const entriesWithStats = await Promise.all(
            entries.map(async (entry) => {
                const totalTicketsResult = await db.raffleEntry.aggregate({
                    where: { raffle_id: entry.raffle_id },
                    _sum: { tickets: true },
                })

                const totalTickets = totalTicketsResult._sum.tickets || 0
                const isWinner = entry.raffle.winners.some(w => w.entry.id === entry.id)

                return {
                    id: entry.id.toString(),
                    raffle_id: entry.raffle_id.toString(),
                    tickets: entry.tickets,
                    created_at: entry.created_at.toISOString(),
                    raffle: {
                        id: entry.raffle.id.toString(),
                        title: entry.raffle.title,
                        type: entry.raffle.type,
                        prize_description: entry.raffle.prize_description,
                        status: entry.raffle.status,
                        end_at: entry.raffle.end_at.toISOString(),
                        drawn_at: entry.raffle.drawn_at?.toISOString() || null,
                        claim_message: entry.raffle.claim_message || null,
                        total_tickets_sold: totalTickets,
                        total_entries: entry.raffle._count.entries,
                        is_winner: isWinner,
                    },
                }
            })
        )

        return NextResponse.json({
            entries: entriesWithStats,
        })
    } catch (error) {
        console.error('Error fetching user tickets:', error)
        return NextResponse.json(
            { error: 'Failed to fetch tickets', details: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        )
    }
}
