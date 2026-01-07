import { getAuthenticatedUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
    try {
        const prisma = db as any
        // Get authenticated user
        const auth = await getAuthenticatedUser(request)
        if (!auth) {
            return NextResponse.json(
                { error: 'Authentication required' },
                { status: 401 }
            )
        }

        // Check if user has a referral (is a referee)
        const referral = await prisma.referral.findUnique({
            where: { referee_user_id: auth.userId },
            include: {
                referrer: {
                    select: {
                        username: true,
                    }
                }
            }
        })

        // Get user's account creation date
        const user = await prisma.user.findUnique({
            where: { id: auth.userId },
            select: { created_at: true },
        })

        if (!user) {
            return NextResponse.json(
                { error: 'User not found' },
                { status: 404 }
            )
        }

        const accountAge = Date.now() - user.created_at.getTime()
        const twentyFourHours = 24 * 60 * 60 * 1000
        const canAddReferral = accountAge <= twentyFourHours && !referral

        return NextResponse.json({
            hasReferral: !!referral,
            canAddReferral,
            accountAge,
            referrerUsername: referral?.referrer?.username,
        })
    } catch (error) {
        console.error('❌ Error checking referral status:', error)
        return NextResponse.json(
            { error: 'Failed to check referral status' },
            { status: 500 }
        )
    }
}
