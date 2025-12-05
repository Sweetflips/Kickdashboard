import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAuthenticatedUser, isAdmin } from '@/lib/auth'

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
        const status = searchParams.get('status') // active, upcoming, completed, all
        const includeHidden = searchParams.get('include_hidden') === 'true'

        const now = new Date()

        // Update raffle statuses based on current time
        await db.raffle.updateMany({
            where: {
                status: { in: ['upcoming', 'active'] },
                start_at: { lte: now },
                end_at: { gt: now },
            },
            data: { status: 'active' },
        })

        await db.raffle.updateMany({
            where: {
                status: { in: ['upcoming', 'active'] },
                end_at: { lte: now },
            },
            data: { status: 'completed' },
        })

        const where: any = {}

        // Filter by status
        if (status && status !== 'all') {
            where.status = status
        } else {
            // Default: show active and upcoming
            where.status = {
                in: ['active', 'upcoming'],
            }
        }

        // Filter out hidden raffles unless explicitly requested (admin only)
        if (!includeHidden) {
            // For regular users: hide raffles that are marked as hidden OR hidden_until_start before start time
            where.AND = [
                { hidden: false }, // Always exclude raffles marked as hidden
                {
                    OR: [
                        { hidden_until_start: false },
                        { hidden_until_start: true, start_at: { lte: now } },
                    ],
                },
            ]
        }

        const raffles = await db.raffle.findMany({
            where,
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
                _count: {
                    select: {
                        entries: true,
                    },
                },
            },
            orderBy: {
                start_at: 'asc',
            },
        })

        // Calculate total tickets sold and user's tickets
        const rafflesWithStats = await Promise.all(
            raffles.map(async (raffle) => {
                const totalTicketsResult = await db.raffleEntry.aggregate({
                    where: { raffle_id: raffle.id },
                    _sum: { tickets: true },
                })

                const totalTickets = totalTicketsResult._sum.tickets || 0
                const userTickets = raffle.entries[0]?.tickets || 0

                return {
                    id: raffle.id.toString(),
                    title: raffle.title,
                    description: raffle.description,
                    type: raffle.type,
                    prize_description: raffle.prize_description,
                    ticket_cost: raffle.ticket_cost,
                    max_tickets_per_user: raffle.max_tickets_per_user,
                    total_tickets_cap: raffle.total_tickets_cap,
                    start_at: raffle.start_at.toISOString(),
                    end_at: raffle.end_at.toISOString(),
                    status: raffle.status,
                    sub_only: raffle.sub_only,
                    hidden_until_start: raffle.hidden_until_start,
                    hidden: raffle.hidden,
                    total_tickets_sold: totalTickets,
                    user_tickets: userTickets,
                    total_entries: raffle._count.entries,
                    created_at: raffle.created_at.toISOString(),
                    drawn_at: raffle.drawn_at?.toISOString() || null,
                }
            })
        )

        return NextResponse.json({
            raffles: rafflesWithStats,
        })
    } catch (error) {
        console.error('Error fetching raffles:', error)
        return NextResponse.json(
            { error: 'Failed to fetch raffles', details: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        )
    }
}

export async function POST(request: Request) {
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

        const body = await request.json()
        const {
            title,
            description,
            type,
            prize_description,
            claim_message,
            ticket_cost,
            max_tickets_per_user,
            total_tickets_cap,
            start_at,
            end_at,
            sub_only,
            hidden_until_start,
        } = body

        // Validation
        if (!title || !prize_description || !ticket_cost || !start_at || !end_at) {
            return NextResponse.json(
                { error: 'Missing required fields' },
                { status: 400 }
            )
        }

        if (ticket_cost <= 0) {
            return NextResponse.json(
                { error: 'Ticket cost must be greater than 0' },
                { status: 400 }
            )
        }

        const startDate = new Date(start_at)
        const endDate = new Date(end_at)

        if (endDate <= startDate) {
            return NextResponse.json(
                { error: 'End date must be after start date' },
                { status: 400 }
            )
        }

        if (max_tickets_per_user !== null && max_tickets_per_user <= 0) {
            return NextResponse.json(
                { error: 'Max tickets per user must be greater than 0' },
                { status: 400 }
            )
        }

        if (total_tickets_cap !== null && total_tickets_cap <= 0) {
            return NextResponse.json(
                { error: 'Total tickets cap must be greater than 0' },
                { status: 400 }
            )
        }

        // Determine status based on start date
        const now = new Date()
        let status = 'upcoming'
        if (startDate <= now && endDate > now) {
            status = 'active'
        } else if (endDate <= now) {
            status = 'completed'
        }

        // Create raffle
        const raffle = await db.raffle.create({
            data: {
                title,
                description: description || null,
                type: type || 'general',
                prize_description,
                claim_message: claim_message || null,
                ticket_cost: parseInt(ticket_cost),
                max_tickets_per_user: max_tickets_per_user ? parseInt(max_tickets_per_user) : null,
                total_tickets_cap: total_tickets_cap ? parseInt(total_tickets_cap) : null,
                start_at: startDate,
                end_at: endDate,
                status,
                sub_only: sub_only === true,
                hidden_until_start: hidden_until_start === true,
                created_by: auth.userId,
            },
        })

        return NextResponse.json({
            raffle: {
                id: raffle.id.toString(),
                title: raffle.title,
                description: raffle.description,
                type: raffle.type,
                prize_description: raffle.prize_description,
                ticket_cost: raffle.ticket_cost,
                max_tickets_per_user: raffle.max_tickets_per_user,
                total_tickets_cap: raffle.total_tickets_cap,
                start_at: raffle.start_at.toISOString(),
                end_at: raffle.end_at.toISOString(),
                status: raffle.status,
                sub_only: raffle.sub_only,
                hidden_until_start: raffle.hidden_until_start,
                created_at: raffle.created_at.toISOString(),
            },
        }, { status: 201 })
    } catch (error) {
        console.error('Error creating raffle:', error)
        return NextResponse.json(
            { error: 'Failed to create raffle', details: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        )
    }
}
