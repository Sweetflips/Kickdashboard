import { db } from '@/lib/db'
import { buildEntryRanges } from '@/lib/raffle-utils'
import { NextResponse } from 'next/server'

export async function GET(
    request: Request,
    { params }: { params: { id: string } }
) {
    try {
        const raffleId = BigInt(params.id)
        const entries = await db.raffleEntry.findMany({
            where: { raffle_id: raffleId },
            include: {
                user: { select: { id: true, username: true } }
            }
        })

        const mapped = entries.map(e => ({ id: e.id, userId: e.user.id, username: e.user.username, tickets: e.tickets, source: e.source }))
        const { ranges, totalTickets } = buildEntryRanges(mapped)

        return NextResponse.json({
            success: true,
            totalTickets,
            entries: ranges.map(r => ({
                entry_id: r.entryId.toString(),
                user_id: r.userId.toString(),
                username: r.username,
                tickets: r.tickets,
                range_start: r.rangeStart,
                range_end: r.rangeEnd,
                source: r.source || 'system',
            }))
        })
    } catch (err) {
        console.error('Error fetching raffle entries:', err)
        return NextResponse.json({ error: 'Failed to fetch entries', details: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 })
    }
}
