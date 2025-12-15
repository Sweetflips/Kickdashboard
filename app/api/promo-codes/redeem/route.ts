import { getAuthenticatedUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * POST /api/promo-codes/redeem
 * Redeem a promo code
 */
export async function POST(request: Request) {
    let body: { code?: string } | null = null
    let auth: { userId: string } | null = null
    let normalizedCode: string | null = null
    let originalCode: string | null = null

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
                console.error('Promo code not found', {
                    attemptedCode: normalizedCode,
                    originalCode: originalCode,
                    userId: auth.userId,
                })
                throw new Error('Invalid promo code')
            }

            if (!promoCode.is_active) {
                console.error('Promo code is inactive', {
                    code: promoCode.code,
                    promoCodeId: promoCode.id,
                    userId: auth.userId,
                    isActive: promoCode.is_active,
                })
                throw new Error('This promo code is no longer active')
            }

            // Check expiration
            if (promoCode.expires_at && new Date() > promoCode.expires_at) {
                console.error('Promo code expired', {
                    code: promoCode.code,
                    promoCodeId: promoCode.id,
                    userId: auth.userId,
                    expiresAt: promoCode.expires_at,
                    now: new Date(),
                })
                throw new Error('This promo code has expired')
            }

            // Check if user already redeemed
            if (promoCode.redemptions.length > 0) {
                console.error('User already redeemed this promo code', {
                    code: promoCode.code,
                    promoCodeId: promoCode.id,
                    userId: auth.userId,
                    existingRedemptions: promoCode.redemptions.length,
                })
                throw new Error('You have already redeemed this promo code')
            }

            // Check max uses
            if (promoCode.max_uses !== null && promoCode.current_uses >= promoCode.max_uses) {
                console.error('Promo code usage limit reached', {
                    code: promoCode.code,
                    promoCodeId: promoCode.id,
                    userId: auth.userId,
                    currentUses: promoCode.current_uses,
                    maxUses: promoCode.max_uses,
                })
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
