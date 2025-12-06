import { NextResponse } from 'next/server'
import { isAdmin } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/**
 * Dedicated admin verification endpoint
 * SECURITY: This endpoint verifies admin status server-side
 * and should be the ONLY source of truth for admin access
 */
export async function GET(request: Request) {
    try {
        const adminCheck = await isAdmin(request)

        return NextResponse.json({
            is_admin: adminCheck,
        })
    } catch (error) {
        console.error('Error verifying admin status:', error)
        return NextResponse.json(
            { is_admin: false },
            { status: 200 } // Return 200 with is_admin: false rather than error
        )
    }
}
