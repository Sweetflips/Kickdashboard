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
        if (!adminCheck) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
        const raffleId = BigInt(params.id)

        // Delete winners and reset draw fields
        await db.$transaction(async (tx) => {
            await tx.raffleWinner.deleteMany({ where: { raffle_id: raffleId } })
            await tx.raffle.update({ where: { id: raffleId }, data: { draw_seed: null, drawn_at: null, status: 'active' } })
        })

        return NextResponse.json({ success: true })
    } catch (err) {
        console.error('Reset draw error:', err)
        return NextResponse.json({ error: 'Failed to reset draw', details: err instanceof Error ? err.message : 'Unknown' }, { status: 500 })
    }
}
