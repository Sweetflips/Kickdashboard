import { getAuthenticatedUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
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

        const body = await request.json()
        const { referralCode } = body

        if (!referralCode || typeof referralCode !== 'string') {
            return NextResponse.json(
                { error: 'Referral code is required' },
                { status: 400 }
            )
        }

        const normalizedCode = referralCode.trim().toUpperCase()

        if (!normalizedCode) {
            return NextResponse.json(
                { error: 'Referral code cannot be empty' },
                { status: 400 }
            )
        }

        // Check if user already has a referral
        const existingReferral = await prisma.referral.findUnique({
            where: { referee_user_id: auth.userId },
        })

        if (existingReferral) {
            return NextResponse.json(
                { error: 'You already have a referral code associated with your account' },
                { status: 400 }
            )
        }

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

        // Check if account is within 24 hours of creation
        const accountAge = Date.now() - user.created_at.getTime()
        const twentyFourHours = 24 * 60 * 60 * 1000

        if (accountAge > twentyFourHours) {
            return NextResponse.json(
                { error: 'Referral code can only be added within 24 hours of account creation' },
                { status: 400 }
            )
        }

        // Find the referrer by username (case-insensitive)
        const referrer = await prisma.user.findFirst({
            where: {
                username: {
                    equals: normalizedCode,
                    mode: 'insensitive',
                }
            },
            select: { id: true, username: true },
        })

        if (!referrer) {
            return NextResponse.json(
                { error: 'Referral code not found' },
                { status: 404 }
            )
        }

        // Check if user is trying to refer themselves
        if (referrer.id === auth.userId) {
            return NextResponse.json(
                { error: 'You cannot refer yourself' },
                { status: 400 }
            )
        }

        // Create referral relationship
        await prisma.referral.create({
            data: {
                referrer_user_id: referrer.id,
                referee_user_id: auth.userId,
                referral_code: normalizedCode,
            },
        })

        console.log(`✅ Referral created via post-signup: ${referrer.username} -> ${auth.userId}`)

        return NextResponse.json({
            success: true,
            message: 'Referral code added successfully',
            referrer: {
                username: referrer.username,
            },
        })
    } catch (error) {
        console.error('❌ Error setting referral code:', error)

        // Handle unique constraint violation (race condition)
        if (error instanceof Error && error.message.includes('Unique constraint')) {
            return NextResponse.json(
                { error: 'You already have a referral code associated with your account' },
                { status: 400 }
            )
        }

        return NextResponse.json(
            { error: 'Failed to set referral code' },
            { status: 500 }
        )
    }
}
