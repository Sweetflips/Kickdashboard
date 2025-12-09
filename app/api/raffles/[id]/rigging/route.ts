import { isAdmin } from '@/lib/auth'
import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

export async function PATCH(
    request: Request,
    { params }: { params: { id: string } }
) {
    try {
        const adminCheck = await isAdmin(request)
        if (!adminCheck) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

        const raffleId = BigInt(params.id)
        const body = await request.json()
        const riggingEnabled = !!body.rigging_enabled
        const rigs = Array.isArray(body.rigs) ? body.rigs : []

        // Validate rigs length (max 5)
        if (rigs.length > 5) {
            return NextResponse.json({ error: 'Maximum 5 rigged winners allowed' }, { status: 400 })
        }

        // Validate each entry belongs to raffle
        for (let i = 0; i < rigs.length; i++) {
            const entryId = BigInt(rigs[i])
            const entry = await db.raffleEntry.findUnique({ where: { id: entryId }, select: { raffle_id: true } })
            if (!entry || entry.raffle_id !== raffleId) {
                return NextResponse.json({ error: `Entry ${entryId} is not valid for raffle` }, { status: 400 })
            }
        }

        // Update raffle rigging_enabled
        await db.raffle.update({ where: { id: raffleId }, data: { rigging_enabled: riggingEnabled } })

        // Replace existing rigging slots for this raffle
        await db.raffleRiggedWinner.deleteMany({ where: { raffle_id: raffleId } })
        for (let i = 0; i < rigs.length; i++) {
            const entryId = BigInt(rigs[i])
            await db.raffleRiggedWinner.create({ data: { raffle_id: raffleId, entry_id: entryId, position: i + 1 } })
        }

        return NextResponse.json({ success: true })
    } catch (err) {
        console.error('Error updating rigging:', err)
        return NextResponse.json({ error: 'Failed to update rigging', details: err instanceof Error ? err.message : 'Unknown' }, { status: 500 })
    }
}
