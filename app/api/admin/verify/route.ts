import { NextResponse } from 'next/server'
import { isAdmin, isModerator, canViewPayouts } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/**
 * Dedicated admin verification endpoint
 * SECURITY: This endpoint verifies admin status server-side
 * and should be the ONLY source of truth for admin access
 */
export async function GET(request: Request) {
    try {
        const adminCheck = await isAdmin(request)
        const moderatorCheck = await isModerator(request)
        const payoutsCheck = await canViewPayouts(request)

        return NextResponse.json({
            is_admin: adminCheck,
            is_moderator: moderatorCheck,
            can_view_payouts: payoutsCheck,
        })
    } catch (error) {
        console.error('Error verifying admin status:', error)
        return NextResponse.json(
            {
                is_admin: false,
                is_moderator: false,
                can_view_payouts: false,
            },
            { status: 200 } // Return 200 with false flags rather than error
        )
    }
}
