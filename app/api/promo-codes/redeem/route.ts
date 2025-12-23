import { getAuthenticatedUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// Simple promo code mapping - codes to sweet coins amount
const PROMO_CODES: Record<string, number> = {
    // Add your promo codes here
    // Example: 'WELCOME': 100,
}

const DEFAULT_SWEET_COINS = 50 // Default amount if code doesn't match

/**
 * POST /api/promo-codes/redeem
 * Redeem a promo code and award sweet coins
 */
export async function POST(request: Request) {
    let body: { code?: string } | null = null
    let auth: Awaited<ReturnType<typeof getAuthenticatedUser>> = null
    let normalizedCode: string | undefined = undefined
    let originalCode: string | undefined = undefined

    try {
        body = await request.json()
        const code = body?.code

        if (!code || typeof code !== 'string') {
            return NextResponse.json(
                { error: 'Promo code is required' },
                { status: 400 }
            )
        }

        originalCode = code
        // Normalize code (uppercase, trim)
        normalizedCode = code.trim().toUpperCase()

        // Get user from token
        auth = await getAuthenticatedUser(request)
        if (!auth) {
            return NextResponse.json(
                { error: 'Authentication required' },
                { status: 401 }
            )
        }
        const authUser = auth

        // Determine sweet coins amount from code
        const sweetCoinsAmount = PROMO_CODES[normalizedCode] ?? DEFAULT_SWEET_COINS

        // Use transaction to ensure atomicity
        const result = await db.$transaction(async (tx) => {
            // Check if user already redeemed this code today (prevent spam)
            const today = new Date()
            today.setHours(0, 0, 0, 0)
            
            const recentRedemption = await tx.sweetCoinHistory.findFirst({
                where: {
                    user_id: authUser.userId,
                    message_id: {
                        startsWith: `promo-${normalizedCode}-`,
                    },
                    earned_at: {
                        gte: today,
                    },
                },
            })

            if (recentRedemption) {
                throw new Error('You have already redeemed this code today')
            }

            // Award Sweet Coins to user
            const userSweetCoins = await tx.userSweetCoins.upsert({
                where: { user_id: authUser.userId },
                update: {
                    total_sweet_coins: {
                        increment: sweetCoinsAmount,
                    },
                },
                create: {
                    user_id: authUser.userId,
                    total_sweet_coins: sweetCoinsAmount,
                    total_emotes: 0,
                },
            })

            // Create sweet coin history entry
            await tx.sweetCoinHistory.create({
                data: {
                    user_id: authUser.userId,
                    sweet_coins_earned: sweetCoinsAmount,
                    message_id: `promo-${normalizedCode}-${Date.now()}`,
                    stream_session_id: null,
                    earned_at: new Date(),
                },
            })

            return {
                sweet_coins_awarded: sweetCoinsAmount,
                code: normalizedCode,
                new_total: userSweetCoins.total_sweet_coins,
            }
        })

        return NextResponse.json({
            success: true,
            sweet_coins_awarded: result.sweet_coins_awarded,
            code: result.code,
            points_awarded: result.sweet_coins_awarded, // Keep for backward compatibility
            message: `Successfully redeemed! You earned ${result.sweet_coins_awarded} Sweet Coins! 🎉`,
        })
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'

        console.error('Error redeeming promo code', {
            error: errorMessage,
            errorStack: error instanceof Error ? error.stack : undefined,
            attemptedCode: normalizedCode || (body?.code ? body.code.trim().toUpperCase() : 'unknown'),
            originalCode: originalCode || body?.code || 'unknown',
            userId: auth?.userId || 'unknown',
            timestamp: new Date().toISOString(),
        })

        // Return user-friendly error messages
        return NextResponse.json(
            {
                error: errorMessage,
            },
            { status: 400 }
        )
    }
}
