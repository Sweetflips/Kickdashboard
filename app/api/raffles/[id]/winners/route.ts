import { getAuthenticatedUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { rewriteApiMediaUrlToCdn } from '@/lib/media-url'
import { getOverlayAccessKey } from '@/lib/overlay-access-key'

export const dynamic = 'force-dynamic'

export async function GET(
    request: Request,
    { params }: { params: { id: string } }
) {
    try {
        // Check for overlay key first (allows OBS browser source without login)
        const { searchParams } = new URL(request.url)
        const providedKey = searchParams.get('key')

        if (providedKey) {
            const validKey = await getOverlayAccessKey()
            if (providedKey === validKey) {
                // Valid overlay key, proceed without auth
            } else {
                return NextResponse.json(
                    { error: 'Invalid overlay key' },
                    { status: 403 }
                )
            }
        } else {
            // No overlay key provided, require authentication
            const auth = await getAuthenticatedUser(request)
            if (!auth) {
                return NextResponse.json(
                    { error: 'Unauthorized' },
                    { status: 401 }
                )
            }
        }

        const raffleId = BigInt(params.id)

        // Get raffle with winners
        const raffle = await db.raffle.findUnique({
            where: { id: raffleId },
            select: {
                id: true,
                title: true,
                status: true,
                drawn_at: true,
                draw_seed: true,
                winners: {
                    select: {
                        id: true,
                        selected_at: true,
                        selected_ticket_index: true,
                        spin_number: true,
                        is_rigged: true,
                        entry: {
                            select: {
                                id: true,
                                tickets: true,
                                user: {
                                    select: {
                                        id: true,
                                        username: true,
                                        profile_picture_url: true,
                                    },
                                },
                            },
                        },
                    },
                    orderBy: {
                        selected_at: 'asc',
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

        // Format winners for response
        const winners = raffle.winners.map((winner) => ({
            id: winner.id.toString(),
            username: winner.entry.user.username,
            user_id: winner.entry.user.id.toString(),
            entry_id: winner.entry.id.toString(),
            profile_picture: rewriteApiMediaUrlToCdn(winner.entry.user.profile_picture_url),
            tickets: winner.entry.tickets,
            selected_at: winner.selected_at.toISOString(),
            selected_ticket_index: winner.selected_ticket_index !== null ? Number(winner.selected_ticket_index) : null,
            spin_number: winner.spin_number || null,
            is_rigged: winner.is_rigged || false,
        }))

        return NextResponse.json({
            raffle_id: raffle.id.toString(),
            title: raffle.title,
            status: raffle.status,
            drawn_at: raffle.drawn_at?.toISOString() || null,
            winners,
        })
    } catch (error) {
        console.error('Error fetching winners:', error)
        return NextResponse.json(
            { error: 'Failed to fetch winners', details: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        )
    }
}
