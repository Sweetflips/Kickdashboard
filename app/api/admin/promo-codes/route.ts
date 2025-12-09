import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { isAdmin } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/promo-codes
 * Get all promo codes with usage stats
 */
export async function GET(request: Request) {
    try {
        const adminCheck = await isAdmin(request)
        if (!adminCheck) {
            return NextResponse.json(
                { error: 'Unauthorized - Admin access required' },
                { status: 403 }
            )
        }

        const promoCodes = await db.promoCode.findMany({
            include: {
                creator: {
                    select: {
                        username: true,
                        profile_picture_url: true,
                    },
                },
                redemptions: {
                    select: {
                        id: true,
                        redeemed_at: true,
                        user: {
                            select: {
                                username: true,
                            },
                        },
                    },
                    orderBy: {
                        redeemed_at: 'desc',
                    },
                },
            },
            orderBy: {
                created_at: 'desc',
            },
        })

        return NextResponse.json({
            success: true,
            codes: promoCodes.map(code => ({
                id: code.id.toString(),
                code: code.code,
                points_value: code.points_value,
                max_uses: code.max_uses,
                current_uses: code.current_uses,
                expires_at: code.expires_at?.toISOString() || null,
                is_active: code.is_active,
                created_by: code.creator.username,
                created_at: code.created_at.toISOString(),
                recent_redemptions: code.redemptions.slice(0, 5).map(r => ({
                    username: r.user.username,
                    redeemed_at: r.redeemed_at.toISOString(),
                })),
            })),
        })
    } catch (error) {
        console.error('Error fetching promo codes:', error)
        return NextResponse.json(
            {
                error: 'Failed to fetch promo codes',
                details: error instanceof Error ? error.message : 'Unknown error',
            },
            { status: 500 }
        )
    }
}

/**
 * POST /api/admin/promo-codes
 * Create new promo code(s)
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
        const { code, points_value, max_uses, expires_at, quantity = 1 } = body

        if (!code || !points_value) {
            return NextResponse.json(
                { error: 'code and points_value are required' },
                { status: 400 }
            )
        }

        if (points_value < 1 || points_value > 1000000) {
            return NextResponse.json(
                { error: 'points_value must be between 1 and 1,000,000' },
                { status: 400 }
            )
        }

        if (quantity < 1 || quantity > 100) {
            return NextResponse.json(
                { error: 'quantity must be between 1 and 100' },
                { status: 400 }
            )
        }

        // Get admin user ID from request
        const token = request.headers.get('authorization')?.replace('Bearer ', '')
        if (!token) {
            return NextResponse.json(
                { error: 'No authorization token provided' },
                { status: 401 }
            )
        }

        const adminUser = await db.user.findFirst({
            where: {
                is_admin: true,
                access_token_hash: { not: null },
            },
            select: { id: true },
        })

        if (!adminUser) {
            return NextResponse.json(
                { error: 'Admin user not found' },
                { status: 404 }
            )
        }

        const createdCodes = []

        // Handle bulk creation
        for (let i = 0; i < quantity; i++) {
            let finalCode = code
            if (quantity > 1) {
                // Add random suffix for bulk codes
                const suffix = Math.random().toString(36).substring(2, 8).toUpperCase()
                finalCode = `${code}-${suffix}`
            }

            // Check if code already exists
            const existing = await db.promoCode.findUnique({
                where: { code: finalCode },
            })

            if (existing) {
                if (quantity === 1) {
                    return NextResponse.json(
                        { error: 'Promo code already exists' },
                        { status: 409 }
                    )
                }
                // Skip for bulk creation
                continue
            }

            const promoCode = await db.promoCode.create({
                data: {
                    code: finalCode,
                    points_value: parseInt(points_value),
                    max_uses: max_uses ? parseInt(max_uses) : null,
                    expires_at: expires_at ? new Date(expires_at) : null,
                    created_by: adminUser.id,
                },
            })

            createdCodes.push({
                id: promoCode.id.toString(),
                code: promoCode.code,
                points_value: promoCode.points_value,
                max_uses: promoCode.max_uses,
                expires_at: promoCode.expires_at?.toISOString() || null,
            })
        }

        return NextResponse.json({
            success: true,
            codes: createdCodes,
            message: `Successfully created ${createdCodes.length} promo code(s)`,
        })
    } catch (error) {
        console.error('Error creating promo code:', error)
        return NextResponse.json(
            {
                error: 'Failed to create promo code',
                details: error instanceof Error ? error.message : 'Unknown error',
            },
            { status: 500 }
        )
    }
}

/**
 * PATCH /api/admin/promo-codes/:id
 * Deactivate a promo code
 */
export async function PATCH(request: Request) {
    try {
        const adminCheck = await isAdmin(request)
        if (!adminCheck) {
            return NextResponse.json(
                { error: 'Unauthorized - Admin access required' },
                { status: 403 }
            )
        }

        const { searchParams } = new URL(request.url)
        const id = searchParams.get('id')

        if (!id) {
            return NextResponse.json(
                { error: 'Promo code ID is required' },
                { status: 400 }
            )
        }

        const body = await request.json()
        const { is_active } = body

        const promoCode = await db.promoCode.update({
            where: { id: BigInt(id) },
            data: {
                is_active: is_active !== undefined ? is_active : false,
            },
        })

        return NextResponse.json({
            success: true,
            code: {
                id: promoCode.id.toString(),
                code: promoCode.code,
                is_active: promoCode.is_active,
            },
            message: `Promo code ${is_active ? 'activated' : 'deactivated'} successfully`,
        })
    } catch (error) {
        console.error('Error updating promo code:', error)
        return NextResponse.json(
            {
                error: 'Failed to update promo code',
                details: error instanceof Error ? error.message : 'Unknown error',
            },
            { status: 500 }
        )
    }
}

/**
 * DELETE /api/admin/promo-codes/:id
 * Delete a promo code (only if not used)
 */
export async function DELETE(request: Request) {
    try {
        const adminCheck = await isAdmin(request)
        if (!adminCheck) {
            return NextResponse.json(
                { error: 'Unauthorized - Admin access required' },
                { status: 403 }
            )
        }

        const { searchParams } = new URL(request.url)
        const id = searchParams.get('id')

        if (!id) {
            return NextResponse.json(
                { error: 'Promo code ID is required' },
                { status: 400 }
            )
        }

        // Check if code has been used
        const promoCode = await db.promoCode.findUnique({
            where: { id: BigInt(id) },
            include: {
                redemptions: true,
            },
        })

        if (!promoCode) {
            return NextResponse.json(
                { error: 'Promo code not found' },
                { status: 404 }
            )
        }

        if (promoCode.current_uses > 0 || promoCode.redemptions.length > 0) {
            return NextResponse.json(
                { error: 'Cannot delete promo code that has been used. Deactivate it instead.' },
                { status: 400 }
            )
        }

        await db.promoCode.delete({
            where: { id: BigInt(id) },
        })

        return NextResponse.json({
            success: true,
            message: 'Promo code deleted successfully',
        })
    } catch (error) {
        console.error('Error deleting promo code:', error)
        return NextResponse.json(
            {
                error: 'Failed to delete promo code',
                details: error instanceof Error ? error.message : 'Unknown error',
            },
            { status: 500 }
        )
    }
}
