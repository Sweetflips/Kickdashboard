import { getBroadcasterToken } from '@/lib/kick-api'
import { NextResponse } from 'next/server'
import { isAdmin } from '@/lib/auth'

const KICK_API_BASE = process.env.KICK_API_BASE || 'https://api.kick.com/public/v1'

export const dynamic = 'force-dynamic'

/**
 * GET /api/debug/check-live
 * Debug endpoint to check Kick API livestream status
 * 
 * SECURITY: Admin-only endpoint
 */
export async function GET(request: Request) {
    try {
        // Require admin access
        const adminCheck = await isAdmin(request)
        if (!adminCheck) {
            return NextResponse.json(
                { error: 'Unauthorized - Admin access required' },
                { status: 403 }
            )
        }

        const { searchParams } = new URL(request.url)
        const broadcasterId = searchParams.get('broadcaster_id')

        if (!broadcasterId) {
            return NextResponse.json({ error: 'broadcaster_id required' }, { status: 400 })
        }

        const endpoint = `/livestreams?broadcaster_user_id[]=${broadcasterId}`
        const url = `${KICK_API_BASE}${endpoint}`

        console.log(`\n🔍 DEBUG: Checking Kick API for broadcaster ${broadcasterId}`)
        console.log(`📍 URL: ${url}\n`)

        // Try without auth first
        let response = await fetch(url, {
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
            },
        })

        console.log(`[DEBUG] First attempt status: ${response.status}`)

        // If 401, try with auth
        if (response.status === 401) {
            console.log(`[DEBUG] Got 401, retrying with auth...`)
            const token = await getBroadcasterToken()
            const clientId = process.env.KICK_CLIENT_ID

            const headers: Record<string, string> = {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/json',
                'Content-Type': 'application/json',
            }
            if (clientId) {
                headers['Client-Id'] = clientId
            }

            response = await fetch(url, { headers })
            console.log(`[DEBUG] Second attempt status: ${response.status}`)
        }

        const data = await response.json()

        console.log(`\n✅ API Response:`)
        console.log(JSON.stringify(data, null, 2))

        // Determine live status
        const isLive = Array.isArray(data.data) && data.data.length > 0
        const livestream = data.data?.[0] || null

        return NextResponse.json({
            success: true,
            isLive,
            broadcasterFound: livestream?.broadcaster_user_id === parseInt(broadcasterId),
            livestream,
            fullResponse: data,
        })
    } catch (error) {
        return NextResponse.json(
            {
                error: error instanceof Error ? error.message : 'Unknown error',
            },
            { status: 500 }
        )
    }
}
