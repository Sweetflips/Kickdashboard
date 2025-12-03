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

        const { searchParams } = new URL(request.url)
        const filter = searchParams.get('filter') // 'all' or 'entered'

        const where: any = {
            status: 'completed',
        }

        // If filter is 'entered', only show raffles the user entered
        if (filter === 'entered') {
            const userEntries = await db.raffleEntry.findMany({
                where: { user_id: auth.userId },
                select: { raffle_id: true },
            })

            const raffleIds = userEntries.map(e => e.raffle_id)
            if (raffleIds.length === 0) {
                return NextResponse.json({ raffles: [] })
            }

            where.id = { in: raffleIds }
        }

        const raffles = await db.raffle.findMany({
            where,
            include: {
                winners: {
                    include: {
                        entry: {
                            include: {
                                user: {
                                    select: {
                                        username: true,
                                        kick_user_id: true,
                                    },
                                },
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
            orderBy: {
                end_at: 'desc',
            },
        })

        const rafflesWithStats = await Promise.all(
            raffles.map(async (raffle) => {
                const totalTicketsResult = await db.raffleEntry.aggregate({
                    where: { raffle_id: raffle.id },
                    _sum: { tickets: true },
                })

                const totalTickets = totalTicketsResult._sum.tickets || 0

                return {
                    id: raffle.id.toString(),
                    title: raffle.title,
                    type: raffle.type,
                    prize_description: raffle.prize_description,
                    end_at: raffle.end_at.toISOString(),
                    total_tickets_sold: totalTickets,
                    total_entries: raffle._count.entries,
                    winners: raffle.winners.map(w => ({
                        username: w.entry.user.username,
                        kick_user_id: w.entry.user.kick_user_id.toString(),
                        tickets: w.entry.tickets,
                    })),
                    draw_seed: raffle.draw_seed,
                    drawn_at: raffle.drawn_at?.toISOString() || null,
                }
            })
        )

        return NextResponse.json({
            raffles: rafflesWithStats,
        })
    } catch (error) {
        console.error('Error fetching raffle history:', error)
        return NextResponse.json(
            { error: 'Failed to fetch raffle history', details: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        )
    }
}
