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

        const response = NextResponse.json({
            is_admin: adminCheck,
            is_moderator: moderatorCheck,
            can_view_payouts: payoutsCheck,
        })

        // Set admin status in cookie to prevent side menu glitches
        // Cookie expires in 90 days (same as auth tokens)
        const expiresDate = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
        const isSecure = request.url.startsWith('https:')
        response.cookies.set('is_admin', String(adminCheck), {
            expires: expiresDate,
            path: '/',
            sameSite: 'lax',
            secure: isSecure,
        })

        return response
    } catch (error) {
        console.error('Error verifying admin status:', error)
        const response = NextResponse.json(
            {
                is_admin: false,
                is_moderator: false,
                can_view_payouts: false,
            },
            { status: 200 } // Return 200 with false flags rather than error
        )

        // Set false in cookie on error
        const expiresDate = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
        const isSecure = request.url.startsWith('https:')
        response.cookies.set('is_admin', 'false', {
            expires: expiresDate,
            path: '/',
            sameSite: 'lax',
            secure: isSecure,
        })

        return response
    }
}
