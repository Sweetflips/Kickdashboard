import { getAuthenticatedUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * POST /api/promo-codes/redeem
 * Redeem a promo code
 */
export async function POST(request: Request) {
    try {
        const body = await request.json()
        const { code } = body

        if (!code || typeof code !== 'string') {
            return NextResponse.json(
                { error: 'Promo code is required' },
                { status: 400 }
            )
        }

        // Normalize code (uppercase, trim)
        const normalizedCode = code.trim().toUpperCase()

        // Get user from token
        const auth = await getAuthenticatedUser(request)
        if (!auth) {
            return NextResponse.json(
                { error: 'Authentication required' },
                { status: 401 }
            )
        }

        // Use transaction to ensure atomicity
        const result = await db.$transaction(async (tx) => {
            // Find promo code with lock
            const promoCode = await tx.promoCode.findUnique({
                where: { code: normalizedCode },
                include: {
                    redemptions: {
                        where: { user_id: auth.userId },
                    },
                },
            })

            if (!promoCode) {
                throw new Error('Invalid promo code')
            }

            if (!promoCode.is_active) {
                throw new Error('This promo code is no longer active')
            }

            // Check expiration
            if (promoCode.expires_at && new Date() > promoCode.expires_at) {
                throw new Error('This promo code has expired')
            }

            // Check if user already redeemed
            if (promoCode.redemptions.length > 0) {
                throw new Error('You have already redeemed this promo code')
            }

            // Check max uses
            if (promoCode.max_uses !== null && promoCode.current_uses >= promoCode.max_uses) {
                throw new Error('This promo code has reached its usage limit')
            }

            // Create redemption record
            await tx.promoCodeRedemption.create({
                data: {
                    promo_code_id: promoCode.id,
                    user_id: auth.userId,
                    sweet_coins_awarded: promoCode.sweet_coins_value,
                },
            })

            // Update usage count
            await tx.promoCode.update({
                where: { id: promoCode.id },
                data: {
                    current_uses: {
                        increment: 1,
                    },
                },
            })

            // Award Sweet Coins to user
            await tx.userSweetCoins.upsert({
                where: { user_id: auth.userId },
                update: {
                    total_sweet_coins: {
                        increment: promoCode.sweet_coins_value,
                    },
                },
                create: {
                    user_id: auth.userId,
                    total_sweet_coins: promoCode.sweet_coins_value,
                    total_emotes: 0,
                },
            })

            return {
                sweet_coins_awarded: promoCode.sweet_coins_value,
                code: promoCode.code,
            }
        })

        return NextResponse.json({
            success: true,
            sweet_coins_awarded: result.sweet_coins_awarded,
            code: result.code,
            message: `Successfully redeemed! You earned ${result.sweet_coins_awarded} Sweet Coins! 🎉`,
        })
    } catch (error) {
        console.error('Error redeeming promo code:', error)
        
        // Return user-friendly error messages
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        
        return NextResponse.json(
            {
                error: errorMessage,
            },
            { status: 400 }
        )
    }
}
