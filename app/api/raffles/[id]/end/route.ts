import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAuthenticatedUser, isAdmin } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function POST(
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

        let raffleId: bigint
        try {
            raffleId = BigInt(params.id)
        } catch {
            return NextResponse.json({ error: 'Invalid raffle id' }, { status: 400 })
        }

        // Check if raffle exists first
        try {
            const exists = await db.raffle.findUnique({ where: { id: raffleId }, select: { id: true } })
            if (!exists) {
                return NextResponse.json({ error: 'Raffle not found' }, { status: 404 })
            }
        } catch (e) {
            // Database error checking existence
            console.error('Error checking raffle existence:', e)
            return NextResponse.json({ error: 'Failed to check raffle' }, { status: 500 })
        }

        // Update raffle to end now
        try {
            await db.raffle.update({
                where: { id: raffleId },
                data: {
                    end_at: new Date(),
                    status: 'completed',
                },
            })
        } catch (e: any) {
            // Prisma P2025: "record to update not found" (race condition / already deleted)
            if (e?.code === 'P2025') {
                return NextResponse.json({ error: 'Raffle not found' }, { status: 404 })
            }
            // Re-throw other Prisma errors to be caught by outer handler
            throw e
        }

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error('Error ending raffle:', error)
        return NextResponse.json(
            { error: 'Failed to end raffle', details: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        )
    }
}
