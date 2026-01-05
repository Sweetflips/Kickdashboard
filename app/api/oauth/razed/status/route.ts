import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { isVerificationExpired } from '@/lib/razed-verification'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url)
        const verificationCode = searchParams.get('code')

        if (!verificationCode) {
            return NextResponse.json(
                { error: 'verification code is required' },
                { status: 400 }
            )
        }

        // Find verification record
        const verification = await db.razedVerification.findUnique({
            where: { verification_code: verificationCode },
            select: {
                status: true,
                expires_at: true,
                verified_at: true,
                kick_user_id: true
            }
        })

        if (!verification) {
            return NextResponse.json(
                { status: 'not_found' },
                { status: 404 }
            )
        }

        // Check if expired
        if (verification.status === 'pending' && isVerificationExpired(verification.expires_at)) {
            // Update status to expired
            await db.razedVerification.update({
                where: { verification_code: verificationCode },
                data: { status: 'expired' }
            })

            return NextResponse.json({
                status: 'expired'
            })
        }

        return NextResponse.json({
            status: verification.status
        })
    } catch (error) {
        console.error('Error checking Razed verification status:', error)
        return NextResponse.json(
            { error: 'Failed to check verification status' },
            { status: 500 }
        )
    }
}

