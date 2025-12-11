import { isAdmin } from '@/lib/auth'
import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function POST(
    request: Request,
    { params }: { params: { id: string } }
) {
    try {
        const adminCheck = await isAdmin(request)
        if (!adminCheck) {
            return NextResponse.json({ error: 'Unauthorized - Admin access required' }, { status: 403 })
        }

        const body = await request.json()
        const raffleId = BigInt(params.id)
        const userId = body.userId ? BigInt(body.userId) : null
        const tickets = Number(body.tickets || 0)

        if (!userId) {
            return NextResponse.json({ error: 'Must provide userId for manual ticket addition' }, { status: 400 })
        }

        if (tickets <= 0) {
            return NextResponse.json({ error: 'Ticket quantity must be greater than 0' }, { status: 400 })
        }

        // Ensure raffle exists
        const raffle = await db.raffle.findUnique({ where: { id: raffleId }, select: { id: true, max_tickets_per_user: true } })
        if (!raffle) return NextResponse.json({ error: 'Raffle not found' }, { status: 404 })

        // Ensure user exists
        const user = await db.user.findUnique({ where: { id: userId } })
        if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

        // Check cap 50 tickets per user
        const existingEntry = await db.raffleEntry.findUnique({ where: { raffle_id_user_id: { raffle_id: raffleId, user_id: userId } }, select: { tickets: true } })
        const currentTickets = existingEntry?.tickets || 0
        const MAX_PER_USER = raffle.max_tickets_per_user ?? 50
        const cap = Math.min(MAX_PER_USER, 50)

        if (currentTickets + tickets > cap) {
            return NextResponse.json({ error: `This user already has ${currentTickets} tickets; the maximum per raffle is ${cap}.` }, { status: 400 })
        }

        // Create or update entry
        if (existingEntry) {
            await db.raffleEntry.update({ where: { raffle_id_user_id: { raffle_id: raffleId, user_id: userId } }, data: { tickets: { increment: tickets } } })
        } else {
            await db.raffleEntry.create({ data: { raffle_id: raffleId, user_id: userId, tickets } })
        }
        // Mark source as manual when we added or updated it
        await db.raffleEntry.update({ where: { raffle_id_user_id: { raffle_id: raffleId, user_id: userId } }, data: { source: 'manual' } })

        return NextResponse.json({ success: true })
    } catch (err) {
        console.error('Error adding manual tickets:', err)
        return NextResponse.json({ error: 'Failed to add tickets', details: err instanceof Error ? err.message : 'Unknown' }, { status: 500 })
    }
}
