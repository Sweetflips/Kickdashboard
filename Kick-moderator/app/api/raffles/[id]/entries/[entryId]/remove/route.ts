import { isAdmin } from '@/lib/auth'
import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function POST(
    request: Request,
    { params }: { params: { id: string, entryId: string } }
) {
    try {
        const adminCheck = await isAdmin(request)
        if (!adminCheck) {
            return NextResponse.json({ error: 'Unauthorized - Admin access required' }, { status: 403 })
        }

        const raffleId = BigInt(params.id)
        const entryId = BigInt(params.entryId)
        const body = await request.json()
        const count = body.count ? Number(body.count) : 1
        if (count <= 0) {
            return NextResponse.json({ error: 'Count must be positive' }, { status: 400 })
        }

        const entry = await db.raffleEntry.findUnique({ where: { id: entryId } })
        if (!entry || entry.raffle_id !== raffleId) {
            return NextResponse.json({ error: 'Entry not found' }, { status: 404 })
        }

        if (entry.tickets <= count) {
            // delete entry
            await db.raffleEntry.delete({ where: { id: entryId } })
        } else {
            await db.raffleEntry.update({ where: { id: entryId }, data: { tickets: { decrement: count } } })
        }

        return NextResponse.json({ success: true })
    } catch (err) {
        console.error('Error removing ticket(s):', err)
        return NextResponse.json({ error: 'Failed to remove ticket(s)', details: err instanceof Error ? err.message : 'Unknown' }, { status: 500 })
    }
}
