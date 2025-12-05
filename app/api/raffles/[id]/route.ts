import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAuthenticatedUser, isAdmin } from '@/lib/auth'

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

        const raffle = await db.raffle.findUnique({
            where: { id: raffleId },
            include: {
                creator: {
                    select: {
                        username: true,
                    },
                },
                entries: {
                    where: {
                        user_id: auth.userId,
                    },
                    select: {
                        tickets: true,
                    },
                },
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
        })

        if (!raffle) {
            return NextResponse.json(
                { error: 'Raffle not found' },
                { status: 404 }
            )
        }

        const totalTicketsResult = await db.raffleEntry.aggregate({
            where: { raffle_id: raffleId },
            _sum: { tickets: true },
        })

        const totalTickets = totalTicketsResult._sum.tickets || 0
        const userTickets = raffle.entries[0]?.tickets || 0

        return NextResponse.json({
            raffle: {
                id: raffle.id.toString(),
                title: raffle.title,
                description: raffle.description,
                type: raffle.type,
                prize_description: raffle.prize_description,
                claim_message: raffle.claim_message,
                ticket_cost: raffle.ticket_cost,
                max_tickets_per_user: raffle.max_tickets_per_user,
                total_tickets_cap: raffle.total_tickets_cap,
                start_at: raffle.start_at.toISOString(),
                end_at: raffle.end_at.toISOString(),
                status: raffle.status,
                sub_only: raffle.sub_only,
                hidden_until_start: raffle.hidden_until_start,
                draw_seed: raffle.draw_seed,
                drawn_at: raffle.drawn_at?.toISOString() || null,
                total_tickets_sold: totalTickets,
                user_tickets: userTickets,
                total_entries: raffle._count.entries,
                winners: raffle.winners.map(w => ({
                    id: w.id.toString(),
                    username: w.entry.user.username,
                    kick_user_id: w.entry.user.kick_user_id.toString(),
                    tickets: w.entry.tickets,
                    selected_at: w.selected_at.toISOString(),
                })),
                created_at: raffle.created_at.toISOString(),
            },
        })
    } catch (error) {
        console.error('Error fetching raffle:', error)
        return NextResponse.json(
            { error: 'Failed to fetch raffle', details: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        )
    }
}

export async function PUT(
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
        const body = await request.json()

        // Check if raffle has entries
        const entryCount = await db.raffleEntry.count({
            where: { raffle_id: raffleId },
        })

        const hasEntries = entryCount > 0

        // If raffle has entries, only allow updating certain fields
        if (hasEntries) {
            const allowedFields: any = {}
            if (body.description !== undefined) allowedFields.description = body.description
            if (body.end_at !== undefined) allowedFields.end_at = new Date(body.end_at)
            if (body.hidden_until_start !== undefined) allowedFields.hidden_until_start = body.hidden_until_start
            if (body.claim_message !== undefined) allowedFields.claim_message = body.claim_message || null
            if (body.hidden !== undefined) allowedFields.hidden = body.hidden

            // Update status if end date changed
            if (body.end_at !== undefined) {
                const endDate = new Date(body.end_at)
                const now = new Date()
                if (endDate <= now) {
                    allowedFields.status = 'completed'
                }
            }

            await db.raffle.update({
                where: { id: raffleId },
                data: allowedFields,
            })
        } else {
            // No entries, allow full update
            const updateData: any = {}
            if (body.title !== undefined) updateData.title = body.title
            if (body.description !== undefined) updateData.description = body.description
            if (body.type !== undefined) updateData.type = body.type
            if (body.prize_description !== undefined) updateData.prize_description = body.prize_description
            if (body.claim_message !== undefined) updateData.claim_message = body.claim_message || null
            if (body.ticket_cost !== undefined) updateData.ticket_cost = parseInt(body.ticket_cost)
            if (body.max_tickets_per_user !== undefined) {
                updateData.max_tickets_per_user = body.max_tickets_per_user ? parseInt(body.max_tickets_per_user) : null
            }
            if (body.total_tickets_cap !== undefined) {
                updateData.total_tickets_cap = body.total_tickets_cap ? parseInt(body.total_tickets_cap) : null
            }
            if (body.start_at !== undefined) updateData.start_at = new Date(body.start_at)
            if (body.end_at !== undefined) updateData.end_at = new Date(body.end_at)
            if (body.sub_only !== undefined) updateData.sub_only = body.sub_only
            if (body.hidden_until_start !== undefined) updateData.hidden_until_start = body.hidden_until_start
            if (body.hidden !== undefined) updateData.hidden = body.hidden

            // Update status based on dates
            if (body.start_at !== undefined || body.end_at !== undefined) {
                const startDate = body.start_at ? new Date(body.start_at) : undefined
                const endDate = body.end_at ? new Date(body.end_at) : undefined
                const raffle = await db.raffle.findUnique({
                    where: { id: raffleId },
                    select: { start_at: true, end_at: true },
                })

                const finalStart = startDate || raffle?.start_at || new Date()
                const finalEnd = endDate || raffle?.end_at || new Date()
                const now = new Date()

                if (finalStart > now) {
                    updateData.status = 'upcoming'
                } else if (finalEnd <= now) {
                    updateData.status = 'completed'
                } else {
                    updateData.status = 'active'
                }
            }

            await db.raffle.update({
                where: { id: raffleId },
                data: updateData,
            })
        }

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error('Error updating raffle:', error)
        return NextResponse.json(
            { error: 'Failed to update raffle', details: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        )
    }
}

export async function DELETE(
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

        const raffleId = BigInt(params.id)

        // Delete raffle - cascade will handle entries and winners due to onDelete: Cascade in schema
        await db.raffle.delete({
            where: { id: raffleId },
        })

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error('Error deleting raffle:', error)
        return NextResponse.json(
            { error: 'Failed to delete raffle', details: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        )
    }
}
