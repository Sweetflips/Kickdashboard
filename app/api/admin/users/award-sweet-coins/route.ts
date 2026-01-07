import { isAdmin } from '@/lib/auth'
import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * POST /api/admin/users/award-sweet-coins
 * Manually award sweet coins to a user
 */
export async function POST(request: Request) {
    try {
        const adminCheck = await isAdmin(request)
        if (!adminCheck) {
            return NextResponse.json(
                { error: 'Unauthorized - Admin access required' },
                { status: 403 }
            )
        }

        const body = await request.json()
        const { kick_user_id, sweet_coins, reason } = body

        if (!kick_user_id || !sweet_coins) {
            return NextResponse.json(
                { error: 'kick_user_id and sweet_coins are required' },
                { status: 400 }
            )
        }

        const sweetCoinsValue = parseInt(sweet_coins)
        if (isNaN(sweetCoinsValue) || sweetCoinsValue === 0) {
            return NextResponse.json(
                { error: 'Sweet coins must be a non-zero number' },
                { status: 400 }
            )
        }

        if (Math.abs(sweetCoinsValue) > 1000000) {
            return NextResponse.json(
                { error: 'Sweet coins value too large (max ±1,000,000)' },
                { status: 400 }
            )
        }

        const prisma = db as any
        // Find user
        const user = await prisma.user.findUnique({
            where: { kick_user_id: BigInt(kick_user_id) },
            select: { id: true, username: true },
        })

        if (!user) {
            return NextResponse.json(
                { error: 'User not found' },
                { status: 404 }
            )
        }

        // Use transaction to ensure atomicity
        const result = await prisma.$transaction(async (tx: any) => {
            // Update or create user sweet coins
            const userSweetCoins = await tx.userSweetCoins.upsert({
                where: { user_id: user.id },
                update: {
                    total_sweet_coins: {
                        increment: sweetCoinsValue,
                    },
                },
                create: {
                    user_id: user.id,
                    total_sweet_coins: Math.max(0, sweetCoinsValue), // Ensure non-negative
                    total_emotes: 0,
                },
            })

            // Create sweet coin history entry
            await tx.sweetCoinHistory.create({
                data: {
                    user_id: user.id,
                    sweet_coins_earned: sweetCoinsValue,
                    message_id: `admin-award-${Date.now()}`,
                    stream_session_id: null,
                    earned_at: new Date(),
                },
            })

            return {
                username: user.username,
                new_total: userSweetCoins.total_sweet_coins,
                sweet_coins_awarded: sweetCoinsValue,
            }
        })

        return NextResponse.json({
            success: true,
            ...result,
            message: `Successfully ${sweetCoinsValue > 0 ? 'awarded' : 'deducted'} ${Math.abs(sweetCoinsValue).toLocaleString()} Sweet Coins ${sweetCoinsValue > 0 ? 'to' : 'from'} ${result.username}`,
            reason: reason || null,
        })
    } catch (error) {
        console.error('Error awarding sweet coins:', error)
        return NextResponse.json(
            {
                error: 'Failed to award sweet coins',
                details: error instanceof Error ? error.message : 'Unknown error',
            },
            { status: 500 }
        )
    }
}
