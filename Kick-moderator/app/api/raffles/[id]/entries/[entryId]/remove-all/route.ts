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

        const entry = await db.raffleEntry.findUnique({ where: { id: entryId } })
        if (!entry || entry.raffle_id !== raffleId) {
            return NextResponse.json({ error: 'Entry not found' }, { status: 404 })
        }

        await db.raffleEntry.delete({ where: { id: entryId } })

        return NextResponse.json({ success: true })
    } catch (err) {
        console.error('Error removing all instances:', err)
        return NextResponse.json({ error: 'Failed to remove instances', details: err instanceof Error ? err.message : 'Unknown' }, { status: 500 })
    }
}
