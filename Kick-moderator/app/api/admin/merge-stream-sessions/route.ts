import { NextResponse } from 'next/server'
import { isAdmin } from '@/lib/auth'
import { mergeLikelyDuplicateSessions } from '@/lib/stream-session-manager'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
    try {
        const adminCheck = await isAdmin(request)
        if (!adminCheck) {
            return NextResponse.json(
                { error: 'Unauthorized - Admin access required' },
                { status: 403 }
            )
        }

        let body: any = null
        try {
            body = await request.json()
        } catch {
            body = null
        }

        const sessionIdRaw = body?.sessionId ?? body?.session_id ?? null
        if (!sessionIdRaw) {
            return NextResponse.json(
                { error: 'sessionId is required' },
                { status: 400 }
            )
        }

        let sessionId: bigint
        try {
            sessionId = BigInt(String(sessionIdRaw))
        } catch {
            return NextResponse.json(
                { error: 'Invalid sessionId format' },
                { status: 400 }
            )
        }

        const result = await mergeLikelyDuplicateSessions(sessionId)

        return NextResponse.json({
            success: true,
            result: result || null,
        })
    } catch (error) {
        return NextResponse.json(
            { error: 'Failed to merge stream sessions', details: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        )
    }
}
