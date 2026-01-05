import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { generateVerificationCode, getVerificationExpiry, canCreateVerification } from '@/lib/razed-verification'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
    try {
        const body = await request.json()
        const { kick_user_id, razed_username } = body

        console.log('[RAZED CONNECT] Received request:', { kick_user_id, razed_username, body })

        // More explicit validation
        if (kick_user_id === undefined || kick_user_id === null || kick_user_id === '') {
            console.error('[RAZED CONNECT] Missing kick_user_id')
            return NextResponse.json(
                { error: 'kick_user_id is required' },
                { status: 400 }
            )
        }

        if (!razed_username || typeof razed_username !== 'string' || razed_username.trim() === '') {
            console.error('[RAZED CONNECT] Missing or invalid razed_username')
            return NextResponse.json(
                { error: 'razed_username is required' },
                { status: 400 }
            )
        }

        // Validate username format (basic check)
        const trimmedUsername = razed_username.trim()
        if (trimmedUsername.length < 1 || trimmedUsername.length > 50) {
            return NextResponse.json(
                { error: 'Invalid Razed username' },
                { status: 400 }
            )
        }

        const kickUserIdBigInt = BigInt(kick_user_id)

        // Check if user exists
        const user = await db.user.findUnique({
            where: { kick_user_id: kickUserIdBigInt },
            select: { id: true }
        })

        if (!user) {
            return NextResponse.json(
                { error: 'User not found' },
                { status: 404 }
            )
        }

        // Rate limiting: Check if user can create new verification
        const canCreate = await canCreateVerification(kickUserIdBigInt, db)
        if (!canCreate) {
            return NextResponse.json(
                { error: 'Please wait before creating a new verification. You can only create one verification per minute.' },
                { status: 429 }
            )
        }

        // Cancel any existing pending verifications for this user
        await db.razedVerification.updateMany({
            where: {
                kick_user_id: kickUserIdBigInt,
                status: 'pending'
            },
            data: {
                status: 'expired'
            }
        })

        // Generate verification code
        const verificationCode = generateVerificationCode()
        const expiresAt = getVerificationExpiry()

        // Create verification record
        const verification = await db.razedVerification.create({
            data: {
                kick_user_id: kickUserIdBigInt,
                razed_username: trimmedUsername.toLowerCase(),
                verification_code: verificationCode,
                expires_at: expiresAt,
                status: 'pending'
            }
        })

        return NextResponse.json({
            success: true,
            verification_code: verificationCode,
            expires_at: expiresAt.toISOString(),
            message: `Please send "${verificationCode}" in Razed chat to verify your account.`
        })
    } catch (error) {
        console.error('Error initiating Razed verification:', error)
        return NextResponse.json(
            { error: 'Failed to initiate verification' },
            { status: 500 }
        )
    }
}

