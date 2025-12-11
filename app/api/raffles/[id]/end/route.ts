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

        const raffleId = BigInt(params.id)

        // Update raffle to end now
        await db.raffle.update({
            where: { id: raffleId },
            data: {
                end_at: new Date(),
                status: 'completed',
            },
        })

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error('Error ending raffle:', error)
        return NextResponse.json(
            { error: 'Failed to end raffle', details: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        )
    }
}
