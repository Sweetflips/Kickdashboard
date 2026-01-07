import { getAuthenticatedUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

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
        const prisma = db as any
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

        // Use transaction to ensure atomicity
        const result = await prisma.$transaction(async (tx: any) => {
            // Look up promo code in database
            const promoCode = await tx.promoCode.findUnique({
                where: { code: normalizedCode },
            })

            if (!promoCode) {
                throw new Error('Promo code not found')
            }

            // Check if code is active
            if (!promoCode.is_active) {
                throw new Error('This promo code is not active')
            }

            // Check if code has expired
            if (promoCode.expires_at && new Date(promoCode.expires_at) < new Date()) {
                throw new Error('This promo code has expired')
            }

            // Check if max uses reached
            if (promoCode.max_uses !== null && promoCode.current_uses >= promoCode.max_uses) {
                throw new Error('This promo code has reached its maximum uses')
            }

            // Check if user already redeemed this code (using unique constraint)
            const existingRedemption = await tx.promoCodeRedemption.findUnique({
                where: {
                    promo_code_id_user_id: {
                        promo_code_id: promoCode.id,
                        user_id: authUser.userId,
                    },
                },
            })

            if (existingRedemption) {
                throw new Error('You have already redeemed this code')
            }

            const sweetCoinsAmount = promoCode.sweet_coins_value

            // Create redemption record
            await tx.promoCodeRedemption.create({
                data: {
                    promo_code_id: promoCode.id,
                    user_id: authUser.userId,
                    sweet_coins_awarded: sweetCoinsAmount,
                },
            })

            // Increment current_uses on promo code
            await tx.promoCode.update({
                where: { id: promoCode.id },
                data: {
                    current_uses: {
                        increment: 1,
                    },
                },
            })

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
