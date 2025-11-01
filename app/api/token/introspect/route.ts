import { NextResponse } from 'next/server'

const KICK_API_BASE = 'https://api.kick.com/public/v1'

/**
 * Token Introspection endpoint
 * Implements RFC 7662 OAuth 2.0 Token Introspection
 * GET /api/token/introspect?access_token=TOKEN
 *
 * Returns token information including:
 * - active: whether the token is valid
 * - scope: list of scopes granted to the token
 * - client_id: the client ID that issued the token
 * - exp: expiration time (if available)
 */
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url)
        const accessToken = searchParams.get('access_token')

        if (!accessToken) {
            return NextResponse.json(
                { error: 'Access token is required' },
                { status: 400 }
            )
        }

        // Call Kick's token introspection endpoint
        const response = await fetch(`${KICK_API_BASE}/token/introspect`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Accept': 'application/json',
                'Content-Type': 'application/json',
            },
        })

        if (!response.ok) {
            const errorText = await response.text()
            console.error(`❌ Token introspection failed: ${response.status} - ${errorText}`)
            return NextResponse.json(
                {
                    error: 'Token introspection failed',
                    details: errorText,
                    status: response.status,
                },
                { status: response.status }
            )
        }

        const introspectionData = await response.json()

        // Parse scope string into array if it's a string
        if (introspectionData.scope && typeof introspectionData.scope === 'string') {
            introspectionData.scopes = introspectionData.scope.split(' ').filter((s: string) => s.length > 0)
        }

        return NextResponse.json({
            ...introspectionData,
            scopes: introspectionData.scopes || [],
            scope_string: introspectionData.scope || '',
        })
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        console.error(`❌ Token introspection error:`, error)
        return NextResponse.json(
            {
                error: 'Failed to introspect token',
                details: errorMessage,
            },
            { status: 500 }
        )
    }
}
